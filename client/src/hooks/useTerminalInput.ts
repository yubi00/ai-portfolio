import { Terminal } from '@xterm/xterm'
import { writePrompt } from '../utils/terminal'

export interface InputState {
  current: string
  cursorPos: number
}

export type OnSubmit = (command: string) => void
export type IsBusy = () => boolean

/**
 * Wires up xterm keyboard input handling for a single terminal session.
 * Returns the `handleData` function to pass to `term.onData(...)`.
 *
 * Responsibilities:
 * - Arrow key cursor movement (left/right)
 * - Character insertion at cursor position
 * - Backspace deletion
 * - Ctrl+C cancellation
 * - Enter submission (delegates to `onSubmit`)
 * - Blocks all other escape sequences
 *
 * `onFirstInput` is called on the first keystroke — used by the caller to
 * prevent any pending late font-load fit from firing mid-session.
 */
export const createInputHandler = (
  term: Terminal,
  getState: () => InputState,
  setState: (s: InputState) => void,
  onSubmit: OnSubmit,
  isBusy: IsBusy,
  onFirstInput?: () => void,
) => {
  // Local mutable state that mirrors React state for synchronous access.
  // We keep both in sync so that React renders stay consistent.
  let current = ''
  let cursorPos = 0

  // Sync local vars into both the local refs and React state.
  const commit = (c: string, pos: number) => {
    current = c
    cursorPos = pos
    setState({ current: c, cursorPos: pos })
  }

  const reset = () => commit('', 0)

  let firstInputFired = false
  const handleData = (data: string) => {
    if (!firstInputFired) { firstInputFired = true; onFirstInput?.() }

    // Left arrow
    if (data === '\u001b[D') {
      if (cursorPos > 0) {
        cursorPos--
        term.write('\u001b[D')
      }
      return
    }

    // Right arrow
    if (data === '\u001b[C') {
      if (cursorPos < current.length) {
        cursorPos++
        term.write('\u001b[C')
      }
      return
    }

    // Up/Down arrows — ignore
    if (data === '\u001b[A' || data === '\u001b[B') return

    // Block all other escape sequences
    if (data.includes('\u001b') || data.charCodeAt(0) === 27) return

    // Enter
    if (data === '\r') {
      const trimmed = current.trim()
      term.write('\r\n')
      if (trimmed.length > 0) {
        if (isBusy()) {
          term.write('\x1b[2m\x1b[38;5;244m(Please wait for the current response to finish)\x1b[0m\r\n')
          writePrompt(term)
          reset()
          return
        }
        reset()
        onSubmit(trimmed)
      } else {
        reset()
        writePrompt(term)
      }
      return
    }

    // Ctrl+C
    if (data === '\u0003') {
      term.write('^C\r\n')
      writePrompt(term)
      reset()
      return
    }

    // Backspace
    if (data === '\u007F') {
      if (cursorPos > 0) {
        current = current.slice(0, cursorPos - 1) + current.slice(cursorPos)
        cursorPos--
        const remaining = current.slice(cursorPos)
        term.write('\b' + remaining + ' ' + '\b'.repeat(remaining.length + 1))
        setState({ current, cursorPos })
      }
      return
    }

    // Printable characters
    const sanitized = data
      .replace(/\r|\n/g, '')
      .replace(/\t/g, '  ')
      .replace(/[^\x20-\x7E]+/g, '')
    if (sanitized.length > 0) {
      current = current.slice(0, cursorPos) + sanitized + current.slice(cursorPos)
      cursorPos += sanitized.length
      const remaining = current.slice(cursorPos)
      term.write(sanitized + remaining + '\u001b[D'.repeat(remaining.length))
      setState({ current, cursorPos })
    }
  }

  return { handleData }
}
