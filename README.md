# Foco em Passos

App web simples para ajudar na execução de tarefas práticas: checklist com cronômetro por tarefa e voz guiando você de uma tarefa para a próxima.

## Funcionalidades

- **Rotinas salvas**: crie listas reutilizáveis (ex: "rotina da manhã") com tarefas e tempo definido para cada uma.
- **Lista rápida**: monte uma lista avulsa na hora, sem precisar salvar.
- **Cronômetro por tarefa**: cada tarefa tem seu próprio tempo. Quando o tempo acaba, o app avisa com som, vibração (quando suportado) e voz, e espera você tocar em "Concluí, próxima tarefa" antes de seguir.
- **Pausar / Pular**: dá para pausar o cronômetro atual ou pular direto para a próxima tarefa a qualquer momento.
- Tudo é salvo localmente no seu celular (`localStorage`) — não precisa de internet nem de conta.

## Como usar no iPhone

1. Hospede estes arquivos em qualquer servidor estático (ex: GitHub Pages) ou abra o `index.html` localmente.
2. No Safari do iPhone, abra o endereço do app.
3. Toque no ícone de compartilhar (quadrado com seta para cima) e escolha **"Adicionar à Tela de Início"**.
4. O app abrirá em tela cheia, como um app normal.

### Sobre o modo silencioso

O iPhone pode abaixar o volume da voz (TTS) se o interruptor de silêncio estiver ativado — isso é uma limitação do sistema, não do app. Deixe o celular sem o modo silencioso ativo durante o uso para garantir que a voz seja ouvida.

## Rodando localmente

Não há dependências nem build. Basta servir a pasta com qualquer servidor estático, por exemplo:

```bash
python3 -m http.server 8000
```

E acessar `http://localhost:8000` no navegador.
