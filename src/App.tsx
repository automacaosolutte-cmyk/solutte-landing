import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { API_URL, ORGANIZZA_URL, SYSTEM_ACCESS_URL } from './config'

const LOGO_ASSET = `${import.meta.env.BASE_URL}assets/solutte-logo-empresariais-transparent.png`

type RevealProps = {
  children: ReactNode
  className?: string
  delay?: number
}

const benefits = [
  ['01', 'Organização', 'Tudo que precisa ser feito, no lugar certo e no tempo certo.'],
  ['02', 'Agilidade', 'Menos etapas manuais. Mais espaço para decisões que importam.'],
  ['03', 'Comodidade', 'Sua operação flui com clareza, de onde você estiver.'],
  ['04', 'Praticidade', 'Processos simples para uma rotina mais leve e produtiva.'],
]

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

function SolutteLogo() {
  return (
    <a className="brand" href="#inicio" aria-label="Solutte Automations — página inicial">
      <img className="brand__image" src={LOGO_ASSET} alt="Solutte Automations" />
    </a>
  )
}

function AccessButton({ compact = false }: { compact?: boolean }) {
  const className = `access-button${compact ? ' access-button--compact' : ''}`
  if (SYSTEM_ACCESS_URL) {
    return <a className={className} href={SYSTEM_ACCESS_URL}>Acessar sistema <span aria-hidden="true">↗</span></a>
  }
  return <a className={className} href="#acesso">Acessar sistema <span aria-hidden="true">↗</span></a>
}

function FlowVisual() {
  return (
    <div className="flow-visual flow-visual--brand" aria-label="Logotipo Solutte Automations e representação de uma operação automatizada" role="img">
      <div className="hero-dots" />
      <div className="hero-logo-halo" />
      <img className="flow-brand" src={LOGO_ASSET} alt="" aria-hidden="true" />
      <span className="hero-orb hero-orb--one" /><span className="hero-orb hero-orb--two" />
      <div className="hero-flow-card hero-flow-card--one"><span>✓</span> Processos em fluxo</div>
      <div className="hero-flow-card hero-flow-card--two"><span>↗</span> Operação conectada</div>
    </div>
  )
}

function LandingPage() {
  return (
    <main>
      <header className="site-header">
        <SolutteLogo />
        <nav className="site-nav" aria-label="Navegação principal">
          <a href="#solucoes">Soluções</a>
          <a href="#produtos">Produtos</a>
          <a href="#beneficios">Benefícios</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#planos">Planos</a>
          <a href="#contato">Contato</a>
        </nav>
        <AccessButton compact />
      </header>

      <section id="inicio" className="hero section-shell">
        <div className="hero__copy">
          <p className="eyebrow">Automações empresariais</p>
          <h1>Inteligência que<br /><em>simplifica</em> processos.</h1>
          <p className="hero__description">A Solutte Automations conecta tecnologia e automação para transformar a sua operação, reduzir tarefas manuais e gerar resultados reais.</p>
          <div className="hero__actions">
            <a className="primary-link" href="#planos">Solicitar demonstração <span aria-hidden="true">→</span></a>
            <a className="secondary-link" href="#como-funciona"><span aria-hidden="true">▷</span> Ver como funciona</a>
          </div>
          <div className="hero__trust">
            <span><b>♢</b> Segurança de dados<br />e conformidade</span>
            <span><b>☁</b> Solução 100% em nuvem<br />com alta disponibilidade</span>
            <span><b>◌</b> Suporte especializado<br />sempre que precisar</span>
          </div>
        </div>
        <FlowVisual />
        <div className="scroll-hint" aria-hidden="true"><span /> Role para descobrir</div>
      </section>

      <section id="solucoes" className="statement section-shell">
        <Reveal>
          <p className="eyebrow">Soluções completas</p>
          <h2>Tudo que sua operação precisa para <em>avançar.</em></h2>
        </Reveal>
        <Reveal className="statement__detail" delay={110}>
          <p>Automatize processos, integre informações e tenha o controle necessário para tomar decisões melhores e mais rápidas.</p>
        </Reveal>
      </section>

      <section id="como-funciona" className="transformation">
        <div className="section-shell transformation__heading">
          <Reveal>
            <p className="eyebrow eyebrow--light">Do manual ao essencial</p>
            <h2>Menos atrito.<br /><em>Mais movimento.</em></h2>
          </Reveal>
          <Reveal delay={120}><p>Uma nova forma de trabalhar começa quando o esforço repetitivo deixa de ser o centro da sua rotina.</p></Reveal>
        </div>
        <div className="process-stage" aria-label="Fluxo que transforma solicitações em entregas concluídas" role="img">
          <div className="stage-grid" />
          <div className="process-line process-line--left" />
          <div className="process-line process-line--right" />
          <div className="process-pill process-pill--one"><span className="pill-icon">+</span> Nova demanda</div>
          <div className="process-pill process-pill--two"><span className="pill-icon pill-icon--blue">↗</span> Em andamento</div>
          <div className="process-pill process-pill--three"><span className="pill-icon pill-icon--red">✓</span> Finalizado</div>
          <div className="process-core"><span>Solutte<br />Automations</span><b>Fluxo<br />inteligente</b></div>
          <span className="travel-dot travel-dot--one" /><span className="travel-dot travel-dot--two" />
        </div>
      </section>

      <section id="beneficios" className="benefits section-shell">
        <Reveal><p className="eyebrow">Feito para a rotina real</p><h2>O que melhora quando tudo <em>se conecta.</em></h2></Reveal>
        <div className="benefit-grid">
          {benefits.map(([number, title, text], index) => (
            <Reveal key={title} className="benefit" delay={index * 80}>
              <span className="benefit__number">{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
              <span className="benefit__line" />
            </Reveal>
          ))}
        </div>
      </section>

      <section id="produtos" className="products section-shell">
        <Reveal className="products__intro"><p className="eyebrow">Produtos Solutte</p><h2>Soluções que dão <em>espaço para avançar.</em></h2><p>Uma plataforma em expansão para organizar, automatizar e simplificar diferentes partes da sua rotina.</p></Reveal>
        <div className="product-grid">
          <Reveal className="product-card product-card--organizza" delay={40}>
            <div className="card-copy"><span className="card-kicker">Solutte Organizza</span><h3>Arquivos organizados. Respostas à distância de uma pergunta.</h3><p>Centralize pastas e documentos com a Izza, a IA que ajuda você a encontrar o que precisa sem perder tempo procurando.</p></div>
            <div className="organizza-visual" aria-hidden="true"><img src="/assets/solutte-organizza-mark.png" alt="" /><div>◌ Pergunte à Izza <b>⌕</b></div></div>
          </Reveal>
          <Reveal className="product-card product-card--accounting" delay={110}>
            <div className="card-copy"><span className="card-kicker">Solutte Contábil</span><h3>Setores conectados, processos em movimento.</h3><p>Módulos para estruturar rotinas contábeis por área, diminuir retrabalho e acompanhar cada etapa com clareza.</p></div>
            <div className="accounting-visual" aria-hidden="true"><span>Fiscal</span><span>Contábil</span><span>DP</span><span>Societário</span><span>+</span><i /></div>
          </Reveal>
          <Reveal className="product-card product-card--mei" delay={180}>
            <div className="card-copy"><span className="card-kicker">Solutte MEI</span><h3>Informações certas, para cada MEI cadastrado.</h3><p>Um programa para organizar e encaminhar comunicações importantes aos microempreendedores de sua base.</p></div>
            <div className="mei-visual" aria-hidden="true"><span>MEI</span><i>→</i><span>DASMEI</span><i>→</i><span>+</span></div>
          </Reveal>
          <Reveal className="product-card product-card--personal" delay={250}>
            <div className="card-copy"><span className="card-kicker">Solutte Pessoal</span><h3>Uma rotina de casa mais leve.</h3><p>Um assistente para apoiar o planejamento das compras e deixar as decisões do dia a dia mais práticas.</p></div>
            <div className="personal-visual" aria-hidden="true"><span>✓ Lista pronta</span><span>○ Itens da semana</span><span>✓ Melhor escolha</span></div>
          </Reveal>
        </div>
      </section>

      <section id="planos" className="closing section-shell">
        <Reveal>
          <span className="closing__spark" aria-hidden="true">✦</span>
          <p className="eyebrow">Simplifique o que move sua empresa</p>
          <h2>Mais leve para operar.<br /><em>Melhor para crescer.</em></h2>
          <p>Um novo ritmo para os seus processos começa aqui.</p>
          <AccessButton />
        </Reveal>
      </section>

      <footer id="contato" className="site-footer section-shell"><SolutteLogo /><span>Automações empresariais que fazem sentido.</span><span>© {new Date().getFullYear()} Solutte Automations</span></footer>
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
  return <img className="portal-brand" src={LOGO_ASSET} alt="Solutte Automations" />
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
          <p className="portal-eyebrow">Área do cliente</p>
          <h1>Automação que<br /><em>segue com você.</em></h1>
          <p>Centralize sua operação, acompanhe o que importa e dê espaço para o seu time avançar.</p>
        </div>
        <div className="portal-intro__flow" aria-hidden="true"><span /><span /><span /><i /><i /></div>
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
            <div><strong>Plano Solutte Automations</strong><p>Valor e meios de pagamento serão definidos na próxima etapa.</p></div>
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
  if (className === 'module-card--organizza') return <div className="module-visual module-visual--organizza" aria-hidden="true"><img src="/assets/solutte-organizza-mark.png" alt="" /><span>⌕ Izza</span></div>
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

  if (route === '#acesso') return <AuthPortal />
  if (route === '#modulos') return <ModuleHub />
  if (route.startsWith('#admin')) return <AdminDashboard />
  return <LandingPage />
}

export default App
