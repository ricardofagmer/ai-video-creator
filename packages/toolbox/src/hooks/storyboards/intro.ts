import type { Storyboard } from '../storyboard';

/**
 * Intro "Sua IA precisa de regras.": the illustrated Ricardo presents EngineOS in first person,
 * then three proofs from the EngineOS repository (rules/git.md git-write guard, the secret scan
 * in rules/security.md, the router supervisor over the 22 files in agents/) and the fixed CTA.
 * Card events are named pill* / alarm / breath / logo so the shared score reacts to them.
 */
export const introEngineOs: Storyboard = {
  id: 'intro',
  bpm: 100,
  roundToBeats: 2,
  shots: [
    {
      id: 'hook',
      section: 'intro',
      minBeats: 6,
      leadBeats: 2.5,
      events: {
        title: { atBeat: 0 },
        avatarIn: { atBeat: 0.25 },
        ping1: { atBeat: 0.5 },
        ping2: { atBeat: 1 },
        ping3: { atBeat: 1.5 },
        ping4: { atBeat: 2 },
      },
      line: {
        text: { pt: 'Oi, eu sou o Ricardo.', en: "Hi, I'm Ricardo." },
        highlight: { pt: 'Ricardo', en: 'Ricardo' },
      },
    },
    {
      id: 'who',
      section: 'groove',
      minBeats: 8,
      events: {
        nameTag: { atBeat: 0 },
        pillRules: { atWord: 'EngineOS' },
      },
      line: {
        text: {
          pt: 'Engenheiro de software. Criei o EngineOS: regras pra usar IA num time de verdade.',
          en: 'Software engineer. I built EngineOS: rules for using AI on a real team.',
        },
        highlight: { pt: 'EngineOS', en: 'EngineOS' },
      },
    },
    {
      id: 'git',
      section: 'full',
      minBeats: 4,
      events: { pillGit: { atWord: 'commit' } },
      line: {
        text: { pt: 'Ela não faz commit sem me perguntar.', en: "It won't commit without asking me." },
        highlight: { pt: 'perguntar', en: 'asking' },
      },
    },
    {
      id: 'secret',
      section: 'tension',
      minBeats: 4,
      events: { alarm: { atWord: { pt: 'negado', en: 'denied' }, offsetBeats: -0.25 } },
      line: {
        text: { pt: 'Não vaza senha: o commit é negado.', en: "It won't leak a password: the commit is denied." },
        highlight: { pt: 'negado', en: 'denied' },
      },
    },
    {
      id: 'agents',
      section: 'warm',
      minBeats: 6,
      events: { pillRouter: { atWord: 'supervisor' }, pillAgents: { atWord: '22' } },
      line: {
        text: {
          pt: 'E um supervisor decide qual dos 22 agentes trabalha.',
          en: 'And a supervisor decides which of 22 agents works.',
        },
        highlight: { pt: 'supervisor', en: 'supervisor' },
      },
    },
    {
      id: 'cta',
      section: 'resolve',
      minBeats: 8,
      tailBeats: 3,
      events: { breath: { atBeat: 0 }, dots: { atBeat: 0.5 }, logo: { atBeat: 2 }, cta: { atBeat: 3 } },
      line: {
        text: { pt: 'Link na bio: checklist grátis.', en: 'Link in bio: free checklist.' },
        highlight: { pt: 'grátis', en: 'free' },
      },
    },
  ],
  copy: {
    pt: {
      hook: 'Sua IA precisa de regras.',
      hookHighlight: 'regras',
      name: 'Ricardo Fagmer',
      role: 'Engenheiro de software',
      handle: '@ricardo.ai.lab',
      gitLabel: 'pergunta antes',
      secretLabel: 'negado',
      agentsLabel: '22 agentes',
      cta: 'Link na bio',
      ctaSub: 'checklist grátis',
      disclosure: 'Voz gerada por IA',
      coverKicker: 'Conheça o EngineOS',
    },
    en: {
      hook: 'Your AI needs rules.',
      hookHighlight: 'rules',
      name: 'Ricardo Fagmer',
      role: 'Software engineer',
      handle: '@ricardo.ai.lab',
      gitLabel: 'asks first',
      secretLabel: 'denied',
      agentsLabel: '22 agents',
      cta: 'Link in bio',
      ctaSub: 'free checklist',
      disclosure: 'AI-generated voice',
      coverKicker: 'Meet EngineOS',
    },
  },
};
