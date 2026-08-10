import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { SYSTEM_ACCESS_URL } from './config'

const LOGO_ASSET = `${import.meta.env.BASE_URL}assets/solutte-automations-logo-transparent.png`

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
          <a href="#recursos">Recursos</a>
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

      <section id="recursos" className="products section-shell">
        <Reveal className="products__intro"><p className="eyebrow">Uma operação em sintonia</p><h2>Ferramentas que acompanham <em>o seu ritmo.</em></h2></Reveal>
        <div className="product-grid">
          <Reveal className="product-card product-card--wide" delay={50}>
            <div className="card-copy"><span className="card-kicker">Processos</span><h3>Da entrada à entrega, sem perder o fio.</h3><p>Fluxos visuais para fazer cada etapa avançar no momento certo.</p></div>
            <div className="mini-flow" aria-hidden="true"><span /><span /><span /><i /><i /><i /></div>
          </Reveal>
          <Reveal className="product-card product-card--tasks" delay={140}>
            <div className="card-copy"><span className="card-kicker">Tarefas</span><h3>Prioridades que ficam claras.</h3><p>Organize o agora e enxergue o que vem depois.</p></div>
            <div className="task-stack" aria-hidden="true"><div><i /> Revisar proposta <b>Hoje</b></div><div><i /> Validar cadastro <b>Amanhã</b></div><div><i /> Preparar entrega <b>Sexta</b></div></div>
          </Reveal>
          <Reveal className="product-card product-card--insight" delay={220}>
            <div className="card-copy"><span className="card-kicker">Acompanhamento</span><h3>Visibilidade para decidir melhor.</h3><p>Informações que tornam cada próxima escolha mais simples.</p></div>
            <div className="chart" aria-hidden="true"><span /><span /><span /><span /><span /><i /></div>
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

type RegisteredUser = {
  name: string
  email: string
  company: string
}

const REGISTERED_USER_KEY = 'solutte-registered-user'

function getRegisteredUser(): RegisteredUser | null {
  try {
    const savedUser = localStorage.getItem(REGISTERED_USER_KEY)
    return savedUser ? JSON.parse(savedUser) as RegisteredUser : null
  } catch {
    return null
  }
}

function PortalBrand() {
  return <img className="portal-brand" src={LOGO_ASSET} alt="Solutte Automations" />
}

function BackToLanding() {
  return <a className="portal-back" href="#inicio"><span aria-hidden="true">←</span> Voltar ao site</a>
}

function AuthPortal() {
  const [step, setStep] = useState<AuthStep>('login')

  const register = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const user = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      company: String(form.get('company') ?? ''),
    }
    localStorage.setItem(REGISTERED_USER_KEY, JSON.stringify(user))
    setStep('payment')
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
          <form className="auth-form" onSubmit={(event) => { event.preventDefault(); window.location.hash = '#admin' }}>
            <label>E-mail<input type="email" autoComplete="email" placeholder="voce@empresa.com.br" required /></label>
            <label>Senha<input type="password" autoComplete="current-password" placeholder="Sua senha" required /></label>
            <div className="auth-form__row"><label className="check-label"><input type="checkbox" /> Manter conectado</label><button type="button" className="text-button">Esqueci minha senha</button></div>
            <button className="portal-primary-button" type="submit">Entrar na plataforma <span aria-hidden="true">→</span></button>
          </form>
          <p className="auth-switch">Ainda não possui uma conta? <button type="button" onClick={() => setStep('register')}>Cadastre-se</button></p>
          <div className="demo-note"><span aria-hidden="true">◇</span><div><strong>Ambiente de demonstração</strong><p>Nesta versão, qualquer acesso abre a prévia administrativa. O backend vai definir usuários, senhas e permissões reais.</p><a href="#admin">Visualizar painel administrativo →</a></div></div>
        </>}

        {step === 'register' && <>
          <div className="auth-panel__heading"><p className="portal-eyebrow">Comece agora</p><h2>Crie sua conta</h2><p>Cadastre sua empresa para iniciar a solicitação de acesso.</p></div>
          <form className="auth-form" onSubmit={register}>
            <label>Seu nome<input name="name" type="text" autoComplete="name" placeholder="Como podemos chamar você?" required /></label>
            <label>E-mail profissional<input name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required /></label>
            <label>Empresa<input name="company" type="text" autoComplete="organization" placeholder="Nome da sua empresa" required /></label>
            <label>Crie uma senha<input type="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" minLength={8} required /></label>
            <label className="check-label check-label--terms"><input type="checkbox" required /> Li e concordo com os termos de uso e a política de privacidade.</label>
            <button className="portal-primary-button" type="submit">Continuar para pagamento <span aria-hidden="true">→</span></button>
          </form>
          <p className="auth-switch">Já possui uma conta? <button type="button" onClick={() => setStep('login')}>Acessar</button></p>
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

function AdminDashboard() {
  const registeredUser = getRegisteredUser()

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <a href="#inicio" className="admin-sidebar__brand"><PortalBrand /></a>
        <nav aria-label="Navegação administrativa">
          <a className="is-active" href="#admin"><span>▦</span> Visão geral</a>
          <a href="#admin-users"><span>♙</span> Usuários</a>
          <a href="#admin-tokens"><span>◌</span> Consumo de tokens</a>
          <a href="#admin-agents"><span>✦</span> Agentes</a>
          <a href="#admin-logs"><span>⇩</span> Logs de execução</a>
        </nav>
        <div className="admin-profile"><span>{registeredUser?.name.slice(0, 2).toUpperCase() ?? '—'}</span><div><b>{registeredUser?.name || 'Sem cadastro'}</b><small>{registeredUser ? 'Administradora' : 'Aguardando cadastro'}</small></div></div>
      </aside>
      <section className="admin-content">
        <header className="admin-header"><div><p className="portal-eyebrow">Painel administrativo</p><h1>Visão geral</h1></div><a className="admin-exit" href="#inicio">Sair <span aria-hidden="true">↗</span></a></header>
        <section className="admin-metrics" aria-label="Indicadores principais">
          <article><span>Usuários ativos</span><strong>24</strong><small>+4 este mês</small></article>
          <article><span>Tokens consumidos</span><strong>1,28 mi</strong><small>de 2 mi disponíveis</small></article>
          <article><span>Agentes ativos</span><strong>06</strong><small>2 em desenvolvimento</small></article>
          <article><span>Execuções hoje</span><strong>382</strong><small>98,7% concluídas</small></article>
        </section>
        <div className="admin-grid">
          <section className="admin-card admin-card--users" id="admin-users"><div className="admin-card__heading"><div><h2>Usuários</h2><p>Cadastros e permissões da plataforma.</p></div><button type="button">+ Novo usuário</button></div><div className="user-table"><div className="user-table__labels"><span>Usuário</span><span>Perfil</span><span>Status</span></div>{registeredUser ? <div className="user-row"><span><b>{registeredUser.name}</b><small>{registeredUser.email}</small></span><span>Administradora</span><span className="status">Aguardando</span></div> : <p className="empty-user-state">Nenhum cadastro salvo ainda. O primeiro usuário cadastrado aparecerá aqui como administrador.</p>}</div></section>
          <section className="admin-card" id="admin-tokens"><div className="admin-card__heading"><div><h2>Uso de tokens</h2><p>Consumo consolidado do período.</p></div><button type="button">Relatório</button></div><div className="token-total"><strong>1.284.650</strong><span>tokens utilizados em agosto</span></div><div className="bar-chart" aria-label="Gráfico de consumo de tokens por semana"><i style={{ height: '37%' }} /><i style={{ height: '56%' }} /><i style={{ height: '44%' }} /><i style={{ height: '76%' }} /><i style={{ height: '91%' }} /></div><div className="chart-labels"><span>Sem. 1</span><span>Sem. 2</span><span>Sem. 3</span><span>Sem. 4</span><span>Hoje</span></div></section>
          <section className="admin-card" id="admin-agents"><div className="admin-card__heading"><div><h2>Agentes</h2><p>Automação em operação.</p></div><button type="button">Gerenciar</button></div><div className="agent-list"><div><span className="agent-icon">◈</span><b>Triagem de solicitações<small>Ativo · 124 execuções hoje</small></b><i className="status-dot" /></div><div><span className="agent-icon agent-icon--red">✦</span><b>Conferência documental<small>Ativo · 86 execuções hoje</small></b><i className="status-dot" /></div><div><span className="agent-icon agent-icon--light">+</span><b>Novo agente<small>Configure uma nova automação</small></b><i>→</i></div></div></section>
          <section className="admin-card" id="admin-logs"><div className="admin-card__heading"><div><h2>Logs de execução</h2><p>Atividade recente da plataforma.</p></div><button className="download-button" type="button">⇩ Baixar logs</button></div><div className="log-list"><p><span className="log-success">●</span> Agente “Triagem” concluiu a análise <time>há 2 min</time></p><p><span className="log-success">●</span> Processo #S-02914 foi atualizado <time>há 12 min</time></p><p><span className="log-info">●</span> Novo cadastro aguarda aprovação <time>há 24 min</time></p></div><button className="card-text-button" type="button">Abrir central de logs →</button></section>
        </div>
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
  if (route === '#admin') return <AdminDashboard />
  return <LandingPage />
}

export default App
