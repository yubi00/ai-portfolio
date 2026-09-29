import { Terminal } from '@xterm/xterm'
import { writePrompt } from '../utils/terminal'

export interface InputState {
  current: string
  cursorPos: number
}

export type OnSubmit = (command: string) => void
export type IsBusy = () => boolean
export type OnCancel = () => void

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
 */
export const createInputHandler = (
  term: Terminal,
  getState: () => InputState,
  setState: (s: InputState) => void,
  onSubmit: OnSubmit,
  isBusy: IsBusy,
  onCancel?: OnCancel,
) => {
  // Local mutable state that mirrors React state for synchronous access.
  // We keep both in sync so that React renders stay consistent.
  let current = ''
  let cursorPos = 0
  const commandHistory: string[] = []
  let historyIndex = 0
  let draftBeforeHistory = ''

  // Sync local vars into both the local refs and React state.
  const commit = (c: string, pos: number) => {
    current = c
    cursorPos = pos
    setState({ current: c, cursorPos: pos })
  }

  const reset = () => commit('', 0)

  const replaceCurrentInput = (next: string) => {
    if (cursorPos > 0) term.write('\b'.repeat(cursorPos))
    term.write('\x1b[0K')
    term.write(next)
    commit(next, next.length)
  }

  const handleData = (data: string) => {
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

    // Up/Down arrows — navigate command history
    if (data === '\u001b[A') {
      if (commandHistory.length === 0 || historyIndex === 0) return
      if (historyIndex === commandHistory.length) draftBeforeHistory = current
      historyIndex--
      replaceCurrentInput(commandHistory[historyIndex])
      return
    }

    if (data === '\u001b[B') {
      if (historyIndex >= commandHistory.length) return
      historyIndex++
      replaceCurrentInput(
        historyIndex === commandHistory.length
          ? draftBeforeHistory
          : commandHistory[historyIndex],
      )
      return
    }

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
        if (commandHistory[commandHistory.length - 1] !== trimmed) commandHistory.push(trimmed)
        if (commandHistory.length > 50) commandHistory.shift()
        historyIndex = commandHistory.length
        draftBeforeHistory = ''
        reset()
        onSubmit(trimmed)
      } else {
        historyIndex = commandHistory.length
        draftBeforeHistory = ''
        reset()
        writePrompt(term)
      }
      return
    }

    // Ctrl+C
    if (data === '\u0003') {
      if (isBusy()) {
        onCancel?.()
        term.write('\r\n^C\r\n')
      } else {
        term.write('^C\r\n')
        writePrompt(term)
      }
      historyIndex = commandHistory.length
      draftBeforeHistory = ''
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
