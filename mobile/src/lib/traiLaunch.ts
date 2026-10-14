/** A home-screen Trai tap can open the chat with a question already chosen. */

type Listener = (message: string) => void

const listeners = new Set<Listener>()
let pending: string | null = null
let lastMessage = ''
let lastAt = 0

export function queueTraiAsk(message: string) {
  const now = Date.now()
  if (message === lastMessage && now - lastAt < 1500) return
  lastMessage = message
  lastAt = now
  if (listeners.size === 0) {
    pending = message
    return
  }
  listeners.forEach(listener => listener(message))
}

export function subscribeTraiAsk(listener: Listener) {
  listeners.add(listener)
  if (pending !== null) {
    const message = pending
    pending = null
    listener(message)
  }
  return () => {
    listeners.delete(listener)
  }
}
