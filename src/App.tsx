import { type ReactNode, useEffect, useRef } from 'react'
import { SYSTEM_ACCESS_URL } from './config'

const LOGO_ASSET = `${import.meta.env.BASE_URL}assets/solutte-logo-transparent.png`

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
    <a className="brand" href="#inicio" aria-label="Solutte — página inicial">
      <img className="brand__image" src={LOGO_ASSET} alt="Solutte" />
    </a>
  )
}

function AccessButton({ compact = false }: { compact?: boolean }) {
  const className = `access-button${compact ? ' access-button--compact' : ''}`
  if (SYSTEM_ACCESS_URL) {
    return <a className={className} href={SYSTEM_ACCESS_URL}>Acessar sistema <span aria-hidden="true">↗</span></a>
  }
  return <button className={className} type="button" disabled aria-label="Acesso ao sistema será disponibilizado em breve">Acessar sistema <span aria-hidden="true">↗</span></button>
}

function FlowVisual() {
  return (
    <div className="flow-visual flow-visual--brand" aria-label="Logotipo Solutte e representação de uma operação automatizada" role="img">
      <div className="hero-dots" />
      <div className="hero-logo-halo" />
      <img className="flow-brand" src={LOGO_ASSET} alt="" aria-hidden="true" />
      <span className="hero-orb hero-orb--one" /><span className="hero-orb hero-orb--two" />
      <div className="hero-flow-card hero-flow-card--one"><span>✓</span> Processos em fluxo</div>
      <div className="hero-flow-card hero-flow-card--two"><span>↗</span> Operação conectada</div>
    </div>
  )
}

function App() {
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
        <a className="header-cta" href="#planos">Solicitar demonstração <span aria-hidden="true">→</span></a>
      </header>

      <section id="inicio" className="hero section-shell">
        <div className="hero__copy">
          <p className="eyebrow">Automação inteligente para empresas</p>
          <h1>Inteligência que<br /><em>simplifica</em> processos.</h1>
          <p className="hero__description">A Solutte conecta tecnologia e automação para transformar a sua operação, reduzir tarefas manuais e gerar resultados reais.</p>
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
          <div className="process-core"><span>Solutte</span><b>Fluxo<br />inteligente</b></div>
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

      <footer id="contato" className="site-footer section-shell"><SolutteLogo /><span>Automação que faz sentido.</span><span>© {new Date().getFullYear()} Solutte</span></footer>
    </main>
  )
}

export default App
