import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { API_URL, ORGANIZZA_URL, SYSTEM_ACCESS_URL } from './config'
import './landing.css'

const FULL_LOGO_ASSET = `${import.meta.env.BASE_URL}assets/brand/organizza/logo-official.png`

type RevealProps = {
  children: ReactNode
  className?: string
  delay?: number
}

const ORGANIZZA_ASSETS = `${import.meta.env.BASE_URL}assets/brand/organizza`

function Reveal({ children, className = '', delay = 0 }: RevealProps) {
  const element = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target = element.current
    if (!target) return
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && target.classList.add('is-visible'),
      { threshold: 0.16 },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={element} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

function AccessButton({ compact = false }: { compact?: boolean }) {
  const className = `access-button${compact ? ' access-button--compact' : ''}`
  if (SYSTEM_ACCESS_URL) {
    return <a className={className} href={SYSTEM_ACCESS_URL}>Acessar sistema <span aria-hidden="true">↗</span></a>
  }
  return <a className={className} href="#acesso">Acessar sistema <span aria-hidden="true">↗</span></a>
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('solutte-theme') === 'light' ? 'light' : 'dark'))
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('solutte-theme', theme)
  }, [theme])
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  return <button className="theme-toggle" type="button" onClick={() => setTheme(nextTheme)} aria-label={`Ativar tema ${nextTheme === 'light' ? 'claro' : 'escuro'}`} title={`Ativar tema ${nextTheme === 'light' ? 'claro' : 'escuro'}`}><span aria-hidden="true">{theme === 'dark' ? '☀' : '◐'}</span>{theme === 'dark' ? 'Claro' : 'Escuro'}</button>
}

function LandingPage() {
  return (
    <main className="organizza-landing">
      <header className="oz-header">
        <a className="oz-logo" href="#inicio" aria-label="Organizza — página inicial">
          <span className="oz-asset-frame oz-asset-frame--logo"><img src={`${ORGANIZZA_ASSETS}/logo-official.png`} alt="Organizza" /></span>
        </a>
        <nav className="oz-nav" aria-label="Navegação principal">
          <a href="#fluxo">Como funciona</a>
          <a href="#izza">Izza</a>
          <a href="#produto">Produto</a>
        </nav>
        <AccessButton compact />
      </header>

      <section id="inicio" className="oz-hero oz-shell">
        <div className="oz-hero__copy">
          <p className="oz-kicker"><span /> Organização que acompanha o trabalho</p>
          <h1>Tudo organizado.<br /><em>Sempre em movimento.</em></h1>
          <p>Documentos, empresas e rotinas conectados em um ambiente inteligente — para o seu escritório saber onde está e o que vem depois.</p>
          <div className="oz-actions">
            <AccessButton />
            <a className="oz-link" href="#produto">Conhecer o Organizza <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <div className="oz-product-window" aria-label="Demonstração visual da interface do Organizza">
          <div className="oz-window-bar"><i /><i /><i /><span>Organizza</span><b>Ambiente conectado</b></div>
          <div className="oz-window-body">
            <aside className="oz-sidebar" aria-hidden="true">
              <span className="oz-sidebar__brand"><img src={`${ORGANIZZA_ASSETS}/icon-official.png`} alt="" /></span>
              <b>Visão geral</b><span className="is-active">Documentos</span><span>Empresas</span><span>Não Processados</span><span>Mapa local</span>
            </aside>
            <div className="oz-file-view">
              <div className="oz-file-heading"><div><small>EMPRESA 059</small><strong>Documentos fiscais</strong></div><span>Julho · 2026</span></div>
              <div className="oz-folder-row"><span className="oz-folder-icon">⌑</span><div><b>DAS</b><small>059 - DAS - 072026.pdf</small></div><i>PDF</i></div>
              <div className="oz-folder-row"><span className="oz-folder-icon">⌑</span><div><b>Extrato do Simples</b><small>Competência 07/2026</small></div><i>PDF</i></div>
              <div className="oz-map-line"><span /><span /><span /><span /></div>
            </div>
            <div className="oz-izza-card">
              <span className="oz-izza-card__avatar"><img src={`${ORGANIZZA_ASSETS}/izza-hero.png`} alt="Izza, assistente do Organizza" /></span>
              <small>IZZA</small><strong>O que você precisa encontrar?</strong>
              <div>Me dê o DAS da empresa 59 de julho de 2026.</div>
              <p><span>✓</span> Prontinho. Encontrei o documento.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="fluxo" className="oz-flow oz-shell">
        <Reveal className="oz-section-heading">
          <p className="oz-kicker">Do recebimento ao lugar certo</p>
          <h2>Se chegou ao Organizza,<br />você sabe onde encontrar.</h2>
          <p>O documento entra. O Organizza identifica, estrutura e mantém tudo disponível para a rotina continuar.</p>
        </Reveal>
        <div className="oz-flow-track" aria-label="Documento recebido, identificado, organizado e disponível">
          {[
            ['01', 'Chegou', 'Um documento entra na rotina.'],
            ['02', 'Identificou', 'Empresa, tipo e competência.'],
            ['03', 'Organizou', 'Cada informação no seu lugar.'],
            ['04', 'Disponível', 'Pronto quando você precisar.'],
          ].map(([number, title, copy], index) => (
            <Reveal className="oz-flow-step" delay={index * 80} key={title}>
              <span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="pergunte" className="oz-ask">
        <div className="oz-shell oz-ask__grid">
          <Reveal className="oz-ask__copy">
            <p className="oz-kicker oz-kicker--dark">Izza + Organizza</p>
            <h2>Não procure.<br /><em>Pergunte.</em></h2>
            <p>A Izza entende o que você quer. O Organizza sabe onde está.</p>
          </Reveal>
          <Reveal className="oz-conversation" delay={100}>
            <div className="oz-message oz-message--user"><small>VOCÊ</small>Me dê o DAS da empresa 59 de julho de 2026.</div>
            <div className="oz-message oz-message--izza"><span><img src={`${ORGANIZZA_ASSETS}/izza-encontrando.png`} alt="" /></span><div><small>IZZA</small><p>Prontinho. Encontrei o documento.</p><article><i>PDF</i><b>059 - DAS - 072026.pdf</b><em>Fiscal · Julho de 2026</em></article></div></div>
          </Reveal>
        </div>
      </section>

      <section id="estrutura" className="oz-structure oz-shell">
        <Reveal className="oz-section-heading oz-section-heading--center">
          <p className="oz-kicker">Uma estrutura para o escritório inteiro</p>
          <h2>A informação deixa de ficar espalhada.</h2>
          <p>Empresas, departamentos, competências e documentos passam a fazer parte do mesmo ambiente.</p>
        </Reveal>
        <Reveal className="oz-structure-map" delay={100}>
          <div className="oz-tree-main"><span><img src={`${ORGANIZZA_ASSETS}/icon-official.png`} alt="" /></span><div><small>AMBIENTE</small><b>Seu escritório</b><em>Organizado pelo Organizza</em></div></div>
          <div className="oz-tree-branches" aria-label="Empresas, departamentos, documentos, competências, processos, pendências e regras conectados">
            {['Empresas', 'Departamentos', 'Documentos', 'Competências', 'Processos', 'Pendências', 'Regras'].map((item, index) => <span key={item} style={{ '--branch': index } as CSSProperties}>{item}</span>)}
          </div>
        </Reveal>
      </section>

      <section id="izza" className="oz-izza oz-shell">
        <Reveal className="oz-izza__portrait">
          <div className="oz-asset-frame oz-asset-frame--izza"><img loading="lazy" src={`${ORGANIZZA_ASSETS}/izza-full.png`} alt="Izza, assistente inteligente do Organizza" /></div>
        </Reveal>
        <Reveal className="oz-izza__copy" delay={90}>
          <p className="oz-kicker">Conheça a Izza</p>
          <h2>Uma assistente que conhece o seu ambiente.</h2>
          <p>A Izza ajuda você a localizar documentos, navegar por empresas e entender o que está pendente — usando a estrutura do Organizza para chegar à resposta.</p>
          <ul><li>Encontra documentos pela sua pergunta</li><li>Navega pelo ambiente organizado</li><li>Ajuda a visualizar pendências da rotina</li></ul>
          <small>Novas ações assistidas serão incorporadas progressivamente ao produto.</small>
        </Reveal>
      </section>

      <section id="produto" className="oz-product oz-shell">
        <Reveal className="oz-section-heading oz-section-heading--center">
          <p className="oz-kicker">Produto real. Rotina real.</p>
          <h2>Clareza para trabalhar.<br />Estrutura para crescer.</h2>
        </Reveal>
        <Reveal className="oz-product-showcase" delay={100}>
          <div className="oz-product-tabs"><span className="is-active">Documentos</span><span>Mapa</span><span>Não Processados</span><span>Empresas</span><span>Izza</span></div>
          <div className="oz-product-grid">
            <div className="oz-product-list"><header><div><small>MAPA LOCAL</small><b>Empresa 059</b></div><span>30.184 arquivos</span></header>{['Fiscal', 'Contábil', 'Pessoal', 'Jurídico'].map((department, index) => <div className={index === 0 ? 'is-active' : ''} key={department}><span>0{index + 1}</span><b>{department}</b><small>{index === 0 ? '12 competências' : 'Organizado'}</small></div>)}</div>
            <div className="oz-product-detail"><small>FISCAL / 2026</small><h3>Julho</h3><div className="oz-doc-card"><i>PDF</i><span><b>059 - DAS - 072026.pdf</b><small>Documento identificado · pronto para abrir</small></span><em>→</em></div><div className="oz-doc-card"><i>PDF</i><span><b>Extrato Declaratório</b><small>Simples Nacional · 07/2026</small></span><em>→</em></div><div className="oz-product-art" aria-hidden="true"><img loading="lazy" src={`${ORGANIZZA_ASSETS}/ui-cards.png`} alt="" /></div></div>
          </div>
        </Reveal>
      </section>

      <section id="planos" className="oz-closing oz-shell">
        <Reveal>
          <span className="oz-closing__symbol"><img loading="lazy" src={`${ORGANIZZA_ASSETS}/icon-official.png`} alt="" /></span>
          <p className="oz-kicker oz-kicker--dark">Um novo ritmo para o seu escritório</p>
          <h2>Seu escritório pode<br />funcionar de outro jeito.</h2>
          <p>Conheça um ambiente feito para organizar a informação e deixar o trabalho seguir.</p>
          <AccessButton />
        </Reveal>
      </section>

      <footer id="contato" className="oz-footer oz-shell">
        <a className="oz-logo" href="#inicio" aria-label="Organizza — voltar ao início"><span className="oz-asset-frame oz-asset-frame--logo"><img loading="lazy" src={`${ORGANIZZA_ASSETS}/logo-official.png`} alt="Organizza" /></span></a>
        <span>Organização documental e inteligência para escritórios.</span>
        <span>Uma solução Solutte · © {new Date().getFullYear()}</span>
      </footer>
    </main>
  )
}

type AuthStep = 'login' | 'register' | 'payment' | 'pending'

type ApiUser = {
  id: string
  name: string
  email: string
  company: string
  role: 'admin' | 'user'
  accountStatus: 'active' | 'pending_payment' | 'pending_approval' | 'suspended'
  paymentStatus: 'not_required' | 'pending' | 'paid' | 'failed'
  createdAt: string
}

type DashboardData = { activeUsers: number, totalTokens: number, activeAgents: number, executionsToday: number }
type Agent = { id: string, name: string, description: string, status: string, createdAt: string }
type Log = { id: string, eventType: string, status: 'info' | 'success' | 'warning' | 'error', message: string, createdAt: string, userName?: string, agentName?: string }
type TokenUsage = { userId: string, name: string, email: string, role: ApiUser['role'], inputTokens: number, outputTokens: number, totalTokens: number, lastUsedAt: string | null }
type AdminSection = 'overview' | 'users' | 'tokens' | 'agents' | 'logs'

const modules = [
  { name: 'Solutte Organizza', eyebrow: 'Organização inteligente', description: 'Pastas, arquivos e a Izza para encontrar documentos com mais rapidez.', className: 'module-card--organizza', available: true },
  { name: 'Solutte Contábil', eyebrow: 'Operação contábil', description: 'Fiscal, Contábil, DP, Societário e mais módulos em uma só operação.', className: 'module-card--accounting', available: false },
  { name: 'Solutte MEI', eyebrow: 'Comunicação para MEIs', description: 'Informações relevantes para os microempreendedores da sua base.', className: 'module-card--mei', available: false },
  { name: 'Solutte Pessoal', eyebrow: 'Rotina pessoal', description: 'Um assistente para apoiar as compras e decisões do dia a dia.', className: 'module-card--personal', available: false },
] as const

const SESSION_KEY = 'solutte-session'

function getSession(): { token: string, user: ApiUser } | null {
  try {
    const session = sessionStorage.getItem(SESSION_KEY)
    return session ? JSON.parse(session) as { token: string, user: ApiUser } : null
  } catch {
    return null
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getSession()
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (session) headers.set('Authorization', `Bearer ${session.token}`)
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a solicitação.')
  return body as T
}

function PortalBrand() {
  return <span className="portal-lockup"><img className="portal-brand" src={FULL_LOGO_ASSET} alt="Organizza" /></span>
}

function BackToLanding() {
  return <a className="portal-back" href="#inicio"><span aria-hidden="true">←</span> Voltar ao site</a>
}

function AuthPortal() {
  const [step, setStep] = useState<AuthStep>('login')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')
    setIsSubmitting(true)
    try {
      const result = await api<{ user: ApiUser, firstUser: boolean }>('/api/auth/register', { method: 'POST', body: JSON.stringify({
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      company: String(form.get('company') ?? ''),
      password: String(form.get('password') ?? ''),
      }) })
      if (result.firstUser) {
        setError('Seu cadastro de administradora foi criado. Faça login para acessar o painel.')
        setStep('login')
      } else setStep('payment')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível concluir o cadastro.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')
    setIsSubmitting(true)
    try {
      const session = await api<{ token: string, user: ApiUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) })
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      window.location.hash = '#modulos'
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível entrar.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (step === 'pending') {
    return (
      <main className="portal-page portal-page--centered">
        <BackToLanding />
        <section className="status-card" aria-labelledby="pending-title">
          <div className="status-card__icon status-card__icon--waiting" aria-hidden="true">◷</div>
          <p className="portal-eyebrow">Solicitação recebida</p>
          <h1 id="pending-title">Seu acesso está aguardando liberação.</h1>
          <p>Recebemos seu cadastro. Assim que o pagamento e a aprovação administrativa forem confirmados, você receberá as próximas instruções no e-mail informado.</p>
          <button className="portal-link-button" type="button" onClick={() => setStep('login')}>Voltar para o acesso</button>
        </section>
      </main>
    )
  }

  return (
    <main className="portal-page">
      <div className="portal-intro">
        <BackToLanding />
        <PortalBrand />
        <div>
          <p className="portal-eyebrow">Seu ambiente organizado</p>
          <h1>Tudo no lugar.<br /><em>Pronto para você.</em></h1>
          <p>Entre para acessar empresas, documentos e a inteligência da Izza no mesmo ambiente.</p>
        </div>
        <img className="portal-intro__izza" src={`${ORGANIZZA_ASSETS}/izza-full.png`} alt="Izza, assistente inteligente do Organizza" />
      </div>

      <section className="auth-panel" aria-live="polite">
        {step === 'login' && <>
          <div className="auth-panel__heading"><p className="portal-eyebrow">Bem-vindo de volta</p><h2>Acesse sua conta</h2><p>Use os dados cadastrados para entrar na plataforma.</p></div>
          <form className="auth-form" onSubmit={login}>
            <label>E-mail<input name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required /></label>
            <label>Senha<input name="password" type="password" autoComplete="current-password" placeholder="Sua senha" required /></label>
            <div className="auth-form__row"><label className="check-label"><input type="checkbox" /> Manter conectado</label><button type="button" className="text-button">Esqueci minha senha</button></div>
            <button className="portal-primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Entrando…' : <>Entrar na plataforma <span aria-hidden="true">→</span></>}</button>
          </form>
          <p className="auth-switch">Ainda não possui uma conta? <button type="button" onClick={() => setStep('register')}>Cadastre-se</button></p>
          {error && <p className="form-message" role="alert">{error}</p>}
        </>}

        {step === 'register' && <>
          <div className="auth-panel__heading"><p className="portal-eyebrow">Comece agora</p><h2>Crie sua conta</h2><p>Cadastre sua empresa para iniciar a solicitação de acesso.</p></div>
          <form className="auth-form" onSubmit={register}>
            <label>Seu nome<input name="name" type="text" autoComplete="name" placeholder="Como podemos chamar você?" required /></label>
            <label>E-mail profissional<input name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required /></label>
            <label>Empresa<input name="company" type="text" autoComplete="organization" placeholder="Nome da sua empresa" required /></label>
            <label>Crie uma senha<input name="password" type="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" minLength={8} required /></label>
            <label className="check-label check-label--terms"><input type="checkbox" required /> Li e concordo com os termos de uso e a política de privacidade.</label>
            <button className="portal-primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Criando cadastro…' : <>Continuar para pagamento <span aria-hidden="true">→</span></>}</button>
          </form>
          <p className="auth-switch">Já possui uma conta? <button type="button" onClick={() => setStep('login')}>Acessar</button></p>
          {error && <p className="form-message" role="alert">{error}</p>}
        </>}

        {step === 'payment' && <>
          <div className="auth-panel__heading"><p className="portal-eyebrow">Próxima etapa</p><h2>Ative sua solicitação</h2><p>O pagamento será integrado nesta área antes da liberação do seu acesso.</p></div>
          <div className="payment-placeholder">
            <div className="payment-placeholder__top"><span className="payment-placeholder__lock" aria-hidden="true">⌁</span><span>Pagamento seguro</span></div>
            <div><strong>Plano Solutte Automações Empresariais</strong><p>Valor e meios de pagamento serão definidos na próxima etapa.</p></div>
            <span className="payment-placeholder__tag">Em breve</span>
          </div>
          <button className="portal-primary-button" type="button" onClick={() => setStep('pending')}>Confirmar solicitação <span aria-hidden="true">→</span></button>
          <button className="portal-secondary-button" type="button" onClick={() => setStep('register')}>Voltar ao cadastro</button>
        </>}
      </section>
    </main>
  )
}

const adminSectionMeta: Record<AdminSection, { label: string, eyebrow: string, title: string }> = {
  overview: { label: 'Visão geral', eyebrow: 'Painel administrativo', title: 'Visão geral' },
  users: { label: 'Usuários', eyebrow: 'Gestão de acesso', title: 'Usuários cadastrados' },
  tokens: { label: 'Consumo de tokens', eyebrow: 'Uso da plataforma', title: 'Consumo por usuário' },
  agents: { label: 'Agentes', eyebrow: 'Automação', title: 'Agentes da operação' },
  logs: { label: 'Logs de execução', eyebrow: 'Auditoria', title: 'Atividade registrada' },
}

function AdminNavigation({ activeSection, user }: { activeSection: AdminSection, user: ApiUser }) {
  const links: Array<{ section: AdminSection, icon: string }> = [
    { section: 'overview', icon: '▦' }, { section: 'users', icon: '♙' }, { section: 'tokens', icon: '◌' }, { section: 'agents', icon: '✦' }, { section: 'logs', icon: '⇩' },
  ]

  return <aside className="admin-sidebar">
    <a href="#inicio" className="admin-sidebar__brand"><PortalBrand /></a>
    <nav aria-label="Navegação administrativa">
      <a href="#modulos"><span>◇</span> Meus módulos</a>
      {links.map(({ section, icon }) => <a key={section} className={activeSection === section ? 'is-active' : ''} href={`#admin/${section}`}><span>{icon}</span> {adminSectionMeta[section].label}</a>)}
    </nav>
    <div className="admin-profile"><span>{user.name.slice(0, 2).toUpperCase()}</span><div><b>{user.name}</b><small>Administradora</small></div></div>
  </aside>
}

function AdminOverview({ dashboard }: { dashboard: DashboardData | null }) {
  return <>
    <section className="admin-metrics" aria-label="Indicadores principais">
      <article><span>Usuários ativos</span><strong>{dashboard ? formatNumber(dashboard.activeUsers) : '—'}</strong><small>contagem real cadastrada</small></article>
      <article><span>Tokens consumidos</span><strong>{dashboard ? formatNumber(dashboard.totalTokens) : '—'}</strong><small>total real registrado</small></article>
      <article><span>Agentes ativos</span><strong>{dashboard ? formatNumber(dashboard.activeAgents) : '—'}</strong><small>agentes em operação</small></article>
      <article><span>Execuções hoje</span><strong>{dashboard ? formatNumber(dashboard.executionsToday) : '—'}</strong><small>sucessos registrados hoje</small></article>
    </section>
    <section className="admin-overview-card">
      <span className="admin-overview-card__icon" aria-hidden="true">✦</span>
      <div><h2>Dados reais, organizados por área.</h2><p>Use o menu lateral para consultar pessoas cadastradas, agentes, consumo individual de tokens e o histórico de atividades.</p></div>
      <a href="#admin/users">Ver usuários <span aria-hidden="true">→</span></a>
    </section>
  </>
}

function UsersPanel({ users, onUpdate }: { users: ApiUser[], onUpdate: (user: ApiUser, update: Partial<Pick<ApiUser, 'role' | 'accountStatus' | 'paymentStatus'>>) => void }) {
  const statusLabel: Record<ApiUser['accountStatus'], string> = { active: 'Ativo', pending_payment: 'Pagamento pendente', pending_approval: 'Aguardando aprovação', suspended: 'Suspenso' }
  return <section className="admin-card admin-card--page" id="admin-users"><div className="admin-card__heading"><div><h2>Usuários</h2><p>Cadastros, permissões e situação de acesso da plataforma.</p></div><a className="admin-card__action" href="#acesso">+ Novo usuário</a></div><div className="user-table"><div className="user-table__labels"><span>Usuário</span><span>Perfil</span><span>Status</span></div>{users.length ? users.map((user) => <div className="user-row" key={user.id}><span><b>{user.name}</b><small>{user.email} · {user.company}</small></span><span>{user.role === 'admin' ? 'Administradora' : 'Usuário'}{user.role === 'user' && <button className="inline-action" type="button" onClick={() => { if (window.confirm(`Confirmar ${user.name} como administradora?`)) onUpdate(user, { role: 'admin' }) }}>Promover</button>}</span><span className={user.accountStatus === 'active' ? 'status status--active' : 'status'}>{user.accountStatus === 'pending_payment' || user.accountStatus === 'pending_approval' ? <button type="button" onClick={() => onUpdate(user, { accountStatus: 'active', paymentStatus: 'paid' })}>Liberar</button> : statusLabel[user.accountStatus]}</span></div>) : <p className="empty-user-state">Ainda não há usuários cadastrados.</p>}</div></section>
}

function TokenUsagePanel({ usage, currentUserId }: { usage: TokenUsage[], currentUserId: string }) {
  const total = usage.reduce((sum, user) => sum + user.totalTokens, 0)
  return <section className="admin-card admin-card--page" id="admin-tokens"><div className="admin-card__heading"><div><h2>Consumo de tokens</h2><p>Todos os usuários cadastrados, inclusive a administradora, aparecem nesta relação.</p></div></div><div className="token-page-total"><strong>{formatNumber(total)}</strong><span>tokens registrados no total</span></div><div className="token-usage-list">{usage.length ? usage.map((user) => <article className="token-user-row" key={user.userId}><div><b>{user.name}{user.userId === currentUserId && <em>Você</em>}</b><small>{user.email} · {user.role === 'admin' ? 'Administradora' : 'Usuário'}</small></div><div><span>Entrada</span><strong>{formatNumber(user.inputTokens)}</strong></div><div><span>Saída</span><strong>{formatNumber(user.outputTokens)}</strong></div><div><span>Total</span><strong>{formatNumber(user.totalTokens)}</strong></div><time>{user.lastUsedAt ? `Último uso: ${new Date(user.lastUsedAt).toLocaleDateString('pt-BR')}` : 'Ainda sem consumo'}</time></article>) : <p className="empty-user-state">Ainda não há usuários cadastrados.</p>}</div></section>
}

function AgentsPanel({ agents, onCreate }: { agents: Agent[], onCreate: () => void }) {
  return <section className="admin-card admin-card--page" id="admin-agents"><div className="admin-card__heading"><div><h2>Agentes</h2><p>Agentes criados para a operação.</p></div><button type="button" onClick={onCreate}>+ Criar agente</button></div><div className="agent-list">{agents.length ? agents.map((agent) => <div key={agent.id}><span className="agent-icon">◈</span><b>{agent.name}<small>{agent.description || 'Sem descrição'} · {agent.status}</small></b><i className={agent.status === 'active' ? 'status-dot' : ''}>{agent.status === 'active' ? '' : '○'}</i></div>) : <p className="empty-user-state">Nenhum agente foi criado ainda.</p>}</div></section>
}

function LogsPanel({ logs, onDownload }: { logs: Log[], onDownload: () => void }) {
  return <section className="admin-card admin-card--page" id="admin-logs"><div className="admin-card__heading"><div><h2>Logs de execução</h2><p>Atividade registrada na plataforma.</p></div><button className="download-button" type="button" onClick={onDownload}>⇩ Baixar logs</button></div><div className="log-list">{logs.length ? logs.map((log) => <p key={log.id}><span className={`log-${log.status}`}>●</span> {log.message}<time>{new Date(log.createdAt).toLocaleString('pt-BR')}</time></p>) : <p className="empty-user-state">Ainda não há logs de execução.</p>}</div></section>
}

const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(value)

function ModuleVisual({ className }: { className: string }) {
  if (className === 'module-card--organizza') return <div className="module-visual module-visual--organizza" aria-hidden="true"><img src={FULL_LOGO_ASSET} alt="" /><span>⌕ Izza</span></div>
  if (className === 'module-card--accounting') return <div className="module-visual module-visual--accounting" aria-hidden="true"><span>F</span><span>C</span><span>DP</span><span>+</span></div>
  if (className === 'module-card--mei') return <div className="module-visual module-visual--mei" aria-hidden="true"><span>MEI</span><i>→</i><span>DAS</span></div>
  return <div className="module-visual module-visual--personal" aria-hidden="true"><span>✓ Lista da semana</span><span>○ Para comprar</span></div>
}

function ModuleHub() {
  const session = getSession()
  const openOrganizza = () => {
    if (ORGANIZZA_URL) window.location.assign(ORGANIZZA_URL)
  }

  if (!session) return <main className="portal-page portal-page--centered"><BackToLanding /><section className="status-card"><p className="portal-eyebrow">Acesso restrito</p><h1>Faça login para acessar seus módulos.</h1><a className="portal-primary-button" href="#acesso">Ir para o acesso</a></section></main>

  return <main className="modules-page">
    <header className="modules-header">
      <a href="#inicio" className="modules-header__brand"><PortalBrand /></a>
      <div className="modules-header__actions">
        {session.user.role === 'admin' && <a className="modules-admin-link" href="#admin/overview">Painel administrativo</a>}
        <button type="button" onClick={() => { sessionStorage.removeItem(SESSION_KEY); window.location.hash = '#acesso' }}>Sair <span aria-hidden="true">↗</span></button>
      </div>
    </header>
    <section className="modules-shell">
      <div className="modules-hero"><div><p className="portal-eyebrow">Meu espaço Solutte</p><h1>Olá, {session.user.name.split(' ')[0]}.</h1><p>Escolha um módulo para continuar. Novos produtos aparecerão aqui assim que estiverem disponíveis para sua conta.</p></div><span aria-hidden="true">✦</span></div>
      <section className="module-grid" aria-label="Módulos Solutte">
        {modules.map((module, index) => <article className={`module-card ${module.className}${module.available && ORGANIZZA_URL ? ' module-card--link' : ''}`} key={module.name} role={module.available && ORGANIZZA_URL ? 'link' : undefined} tabIndex={module.available && ORGANIZZA_URL ? 0 : undefined} onClick={module.available && ORGANIZZA_URL ? openOrganizza : undefined} onKeyDown={module.available && ORGANIZZA_URL ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOrganizza() } } : undefined}>
          <div className="module-card__content"><span className="module-card__number">0{index + 1}</span><p>{module.eyebrow}</p><h2>{module.name}</h2><span className={module.available ? 'module-status module-status--available' : 'module-status'}>{module.available ? 'Disponível' : 'Em breve'}</span><p className="module-card__description">{module.description}</p>{module.available && ORGANIZZA_URL ? <a className="module-open-link" href={ORGANIZZA_URL}>Abrir módulo <span aria-hidden="true">→</span></a> : <span className="module-open-link module-open-link--disabled">{module.available ? 'Preparando acesso' : 'Em desenvolvimento'}</span>}</div>
          <ModuleVisual className={module.className} />
        </article>)}
      </section>
    </section>
  </main>
}

function AdminDashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [users, setUsers] = useState<ApiUser[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [tokenUsage, setTokenUsage] = useState<TokenUsage[]>([])
  const [error, setError] = useState('')
  const session = getSession()
  const candidateSection = window.location.hash.replace('#admin/', '')
  const activeSection: AdminSection = Object.prototype.hasOwnProperty.call(adminSectionMeta, candidateSection) ? candidateSection as AdminSection : 'overview'

  const loadDashboard = async () => {
    try {
      setError('')
      const [metrics, usersResult, agentsResult, logsResult, tokensResult] = await Promise.all([
        api<DashboardData>('/api/admin/dashboard'),
        api<{ users: ApiUser[] }>('/api/admin/users'),
        api<{ agents: Agent[] }>('/api/admin/agents'),
        api<{ logs: Log[] }>('/api/admin/logs?limit=8'),
        api<{ usage: TokenUsage[] }>('/api/admin/token-usage'),
      ])
      setDashboard(metrics)
      setUsers(usersResult.users)
      setAgents(agentsResult.agents)
      setLogs(logsResult.logs)
      setTokenUsage(tokensResult.usage)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os dados do painel.')
    }
  }

  useEffect(() => { void loadDashboard() }, [])

  const updateUser = async (user: ApiUser, update: Partial<Pick<ApiUser, 'role' | 'accountStatus' | 'paymentStatus'>>) => {
    try {
      await api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(update) })
      await loadDashboard()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar o usuário.')
    }
  }

  const createAgent = async () => {
    const name = window.prompt('Qual é o nome do novo agente?')
    if (!name?.trim()) return
    const description = window.prompt('Descreva brevemente o que ele faz.') || ''
    try {
      await api('/api/admin/agents', { method: 'POST', body: JSON.stringify({ name, description, status: 'draft' }) })
      await loadDashboard()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível criar o agente.')
    }
  }

  const downloadLogs = async () => {
    try {
      if (!API_URL || !session) throw new Error('Faça login para baixar os logs.')
      const response = await fetch(`${API_URL}/api/admin/logs/download`, { headers: { Authorization: `Bearer ${session.token}` } })
      if (!response.ok) throw new Error('Não foi possível gerar o arquivo de logs.')
      const file = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = file
      link.download = 'solutte-logs.json'
      link.click()
      URL.revokeObjectURL(file)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível baixar os logs.')
    }
  }

  if (!session) return <main className="portal-page portal-page--centered"><BackToLanding /><section className="status-card"><p className="portal-eyebrow">Acesso restrito</p><h1>Faça login para acessar o painel.</h1><a className="portal-primary-button" href="#acesso">Ir para o acesso</a></section></main>

  return (
    <main className="admin-page">
      <AdminNavigation activeSection={activeSection} user={session.user} />
      <section className="admin-content">
        <header className="admin-header"><div><p className="portal-eyebrow">{adminSectionMeta[activeSection].eyebrow}</p><h1>{adminSectionMeta[activeSection].title}</h1></div><button className="admin-exit" type="button" onClick={() => { sessionStorage.removeItem(SESSION_KEY); window.location.hash = '#acesso' }}>Sair <span aria-hidden="true">↗</span></button></header>
        {error && <p className="form-message" role="alert">{error}</p>}
        {activeSection === 'overview' && <AdminOverview dashboard={dashboard} />}
        {activeSection === 'users' && <UsersPanel users={users} onUpdate={(user, update) => void updateUser(user, update)} />}
        {activeSection === 'tokens' && <TokenUsagePanel usage={tokenUsage} currentUserId={session.user.id} />}
        {activeSection === 'agents' && <AgentsPanel agents={agents} onCreate={() => void createAgent()} />}
        {activeSection === 'logs' && <LogsPanel logs={logs} onDownload={() => void downloadLogs()} />}
      </section>
    </main>
  )
}

function App() {
  const [route, setRoute] = useState(() => window.location.hash)

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  const isLanding = route !== '#acesso' && route !== '#modulos' && !route.startsWith('#admin')
  const page = route === '#acesso' ? <AuthPortal /> : route === '#modulos' ? <ModuleHub /> : route.startsWith('#admin') ? <AdminDashboard /> : <LandingPage />
  return <>{page}{!isLanding && <ThemeToggle />}</>
}

export default App
