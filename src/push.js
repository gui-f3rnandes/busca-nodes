import { supabase } from './supabase'

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const pushSupported = () =>
  Boolean(KEY) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const toBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

// 'unsupported' | 'denied' | 'on' | 'off'
export async function pushState() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

// Pede permissão, inscreve este aparelho e guarda a inscrição na nuvem (idempotente).
export async function enablePush(userId) {
  if ((await Notification.requestPermission()) !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(KEY) }))
  const { endpoint, keys } = sub.toJSON()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint, user_id: userId, keys, device: navigator.userAgent.slice(0, 120) })
  if (error) throw error
  return 'on'
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  return 'off'
}
