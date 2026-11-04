import { useCallback, useEffect, useRef, useState } from 'react'
import { loadData, saveData } from './storage'
import { supabase } from './supabase'
import { pushState, enablePush, disablePush } from './push'
import Matrix from './Matrix'
import Calendar from './Calendar'
import Notes from './Notes'
import Pendencias from './Pendencias'

const TEMA = 'app-tarefas:tema'
const STATUS = { saved: 'Salvo na nuvem', saving: 'Salvando…', error: 'Erro ao salvar' }
const ghostBase = 'rounded-md px-3 py-1.5 text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500'
const ghost = `${ghostBase} text-slate-600`
const PUSH_MSG = {
  denied: 'Lembretes bloqueados: libere as notificações deste site nas configurações do navegador.',
  unsupported: 'Lembretes indisponíveis aqui. No iPhone, instale o app na tela inicial e abra por ele.',
  error: 'Não foi possível alterar os lembretes. Tente de novo.',
}
const bell = (on) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
)

const icon = (children) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)
const NAV = [
  { id: 'tarefas', label: 'Tarefas', icon: icon(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>) },
  { id: 'pendencias', label: 'Pendências', icon: icon(<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>) },
  { id: 'calendario', label: 'Calendário', icon: icon(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>) },
  { id: 'notas', label: 'Notas', icon: icon(<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="14 3 14 9 20 9" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="14" y2="17" /></>) },
]

export default function Board({ userId }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [status, setStatus] = useState('saved')
  const [day, setDay] = useState(null)
  const [tab, setTab] = useState('tarefas') // página ativa no celular
  const [push, setPush] = useState('checking') // lembretes deste aparelho

  useEffect(() => {
    pushState().then((s) => {
      setPush(s)
      if (s === 'on') enablePush(userId).catch(() => {}) // garante que a inscrição está na nuvem
    })
  }, [userId])

  const togglePush = async () => {
    try {
      setPush(push === 'on' ? await disablePush() : await enablePush(userId))
    } catch {
      setPush('error')
    }
  }
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const stamp = useRef(null) // versão da nuvem que conhecemos
  const dirty = useRef(false) // alteração ainda não enviada
  const skip = useRef(false) // a próxima mudança de data veio da nuvem
  const latest = useRef(null)

  const load = useCallback(async () => {
    try {
      const r = await loadData()
      stamp.current = r.stamp
      skip.current = r.stamp !== null // sem linha na nuvem: salva (migra) os dados locais
      setData(r.data)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [])

  const flush = useCallback(async () => {
    if (!dirty.current) return
    dirty.current = false
    const s = await saveData(userId, latest.current)
    if (s) {
      stamp.current = s
      setStatus(dirty.current ? 'saving' : 'saved')
    } else {
      dirty.current = true
      setStatus('error')
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!data) return
    latest.current = data
    if (skip.current) {
      skip.current = false
      return
    }
    dirty.current = true
    setStatus('saving')
    const id = setTimeout(flush, 800)
    return () => clearTimeout(id)
  }, [data, flush])

  // Ao sair da aba: envia o que falta. Ao voltar: busca mudanças feitas em outro aparelho.
  useEffect(() => {
    const onVisibility = async () => {
      if (document.visibilityState === 'hidden') return flush()
      if (dirty.current) return
      try {
        const r = await loadData()
        if (!dirty.current && r.stamp && r.stamp !== stamp.current) {
          stamp.current = r.stamp
          skip.current = true
          setData(r.data)
        }
      } catch {
        // sem conexão: mantém o que está na tela
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [flush])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem(TEMA, dark ? 'dark' : 'light')
    } catch {
      // sem armazenamento: o tema vale só nesta sessão
    }
  }, [dark])

  const sair = async () => {
    await flush()
    await supabase.auth.signOut()
  }

  if (loadError) {
    return (
      <div className="p-6 text-sm text-slate-800">
        <p className="mb-3">Não foi possível carregar seus dados. Verifique a conexão.</p>
        <button onClick={load} className={ghost}>Tentar de novo</button>
        <button onClick={sair} className={ghost}>Sair</button>
      </div>
    )
  }
  if (!data) return <p className="p-6 text-sm text-slate-400">Carregando…</p>

  const set = (patch) => setData((d) => ({ ...d, ...patch }))

  // No celular só a aba ativa aparece; no computador (lg) todas ficam visíveis.
  const show = (id) => `${tab === id ? '' : 'hidden'} lg:block`

  return (
    <div className="min-h-screen text-slate-800 lg:h-screen lg:overflow-hidden">
      <main className="mx-auto flex max-w-screen-2xl flex-col px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:h-full lg:py-4 lg:pb-4">
        <header className="mb-6 flex items-center justify-between lg:mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Tarefas</h1>
          <div className="flex items-center gap-1">
            <span aria-live="polite" className={`mr-2 hidden text-xs sm:inline ${status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>
              {STATUS[status]}
            </span>
            <span role="img" aria-label={STATUS[status]} title={STATUS[status]} className={`mr-2 h-2 w-2 rounded-full sm:hidden ${status === 'error' ? 'bg-red-500' : status === 'saving' ? 'bg-indigo-500' : 'bg-slate-300'}`} />
            {['on', 'off', 'error'].includes(push) && (
              <button
                onClick={togglePush}
                aria-label={push === 'on' ? 'Desativar lembretes neste aparelho' : 'Ativar lembretes neste aparelho'}
                title={push === 'on' ? 'Lembretes ativos neste aparelho' : 'Ativar lembretes neste aparelho'}
                className={`${ghostBase} ${push === 'on' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600'}`}
              >
                {bell(push === 'on')}
              </button>
            )}
            <button onClick={() => setDark(!dark)} className={ghost}>
              <span className="hidden sm:inline">Modo </span>
              <span className="capitalize sm:normal-case">{dark ? 'claro' : 'escuro'}</span>
            </button>
            <button onClick={sair} className={ghost}>Sair</button>
          </div>
        </header>
        {PUSH_MSG[push] && <p role="status" className="-mt-3 mb-5 text-xs text-slate-500 lg:-mt-2 lg:mb-4">{PUSH_MSG[push]}</p>}

        <div className="grid gap-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_19rem_19rem] lg:grid-rows-1">
          <div className={`${show('tarefas')} lg:h-full lg:min-h-0`}>
            <Matrix tasks={data.tasks} onChange={(tasks) => set({ tasks })} />
          </div>
          <div className="flex flex-col gap-6 lg:min-h-0">
            <div className={`${show('calendario')} lg:shrink-0`}>
              <Calendar tasks={data.tasks} day={day} onPick={setDay} />
            </div>
            <div className={`${tab === 'notas' ? '' : 'hidden'} lg:flex lg:min-h-0 lg:flex-1 lg:flex-col`}>
              <Notes value={data.notes} onChange={(notes) => set({ notes })} />
            </div>
          </div>
          <div className={`${show('pendencias')} lg:h-full lg:min-h-0`}>
            <Pendencias pend={data.pend} draw={data.draw} onChange={set} />
          </div>
        </div>
      </main>

      <nav aria-label="Seções" className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-slate-200 bg-slate-50 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => { setTab(n.id); window.scrollTo(0, 0) }}
            aria-current={tab === n.id ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 py-3 text-xs focus-visible:outline-2 focus-visible:outline-indigo-500 ${tab === n.id ? 'font-medium text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}
          >
            {n.icon}
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
