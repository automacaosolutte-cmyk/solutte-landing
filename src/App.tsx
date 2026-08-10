import { type ReactNode, useEffect, useRef } from 'react'
import { SYSTEM_ACCESS_URL } from './config'

const LOGO_ASSET = `${import.meta.env.BASE_URL}assets/solutte-logo.png`

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
    <div className="flow-visual" aria-label="Representação visual de um processo automatizado" role="img">
      <div className="visual-glow visual-glow--one" />
      <div className="visual-glow visual-glow--two" />
      <div className="orbit orbit--one" />
      <div className="orbit orbit--two" />
      <div className="flow-path"><span /><span /><span /></div>
      <div className="flow-card flow-card--start"><span className="flow-card__dot" /><span>Solicitação</span></div>
      <div className="flow-card flow-card--middle"><span className="flow-card__check">✓</span><span>Processar</span></div>
      <div className="flow-card flow-card--end"><span className="flow-card__spark">✦</span><span>Concluído</span></div>
      <div className="flow-node flow-node--one" />
      <div className="flow-node flow-node--two" />
      <div className="flow-status"><span className="pulse" /> Fluxo ativo</div>
    </div>
  )
}

function App() {
  return (
    <main>
      <header className="site-header">
        <SolutteLogo />
        <AccessButton compact />
      </header>

      <section id="inicio" className="hero section-shell">
        <div className="hero__copy">
          <p className="eyebrow">Automação inteligente para empresas</p>
          <h1>O seu dia a dia,<br /><em>em fluxo.</em></h1>
          <p className="hero__description">Transforme rotinas complexas em processos simples, organizados e prontos para acontecer.</p>
          <div className="hero__actions">
            <AccessButton />
            <a className="text-link" href="#solucoes">Conheça a Solutte <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <FlowVisual />
        <div className="scroll-hint" aria-hidden="true"><span /> Role para descobrir</div>
      </section>

      <section className="statement section-shell">
        <Reveal>
          <p className="eyebrow">Clareza que movimenta</p>
          <h2>Quando cada processo encontra seu caminho, <em>o negócio avança.</em></h2>
        </Reveal>
        <Reveal className="statement__detail" delay={110}>
          <p>A Solutte conecta tarefas, pessoas e informações em uma operação que funciona com mais precisão — sem complicar o que já é importante.</p>
        </Reveal>
      </section>

      <section id="solucoes" className="transformation">
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

      <section className="benefits section-shell">
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

      <section className="products section-shell">
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

      <section className="closing section-shell">
        <Reveal>
          <span className="closing__spark" aria-hidden="true">✦</span>
          <p className="eyebrow">Simplifique o que move sua empresa</p>
          <h2>Mais leve para operar.<br /><em>Melhor para crescer.</em></h2>
          <p>Um novo ritmo para os seus processos começa aqui.</p>
          <AccessButton />
        </Reveal>
      </section>

      <footer className="site-footer section-shell"><SolutteLogo /><span>Automação que faz sentido.</span><span>© {new Date().getFullYear()} Solutte</span></footer>
    </main>
  )
}

export default App
