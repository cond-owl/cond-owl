# Calendário e reservas

Regras de negócio da aba **Agenda** (`src/app/index.tsx`) e por que foram assim.

- **Eventos guardam data completa (`AAAA-MM-DD`), não só o dia.** Com só o dia
  era impossível navegar entre meses nem distinguir passado de futuro. A chave
  em texto ordena corretamente, então `data >= hoje` funciona por comparação direta.
- **O calendário abre no mês real atual** e navega para qualquer mês seguinte,
  sem limite, para permitir reservas antecipadas.
- **Síndico vê meses e eventos passados; morador não.** O morador só precisa do
  que ainda vai acontecer; o histórico serve à gestão do síndico. O bloqueio é
  aplicado na exibição (`eventosVisiveis`) e na navegação (`mesExibido`), e vale
  mesmo se o perfil mudar na mesma sessão do app.
- **Ninguém reserva em data passada** (nem síndico), e reserva para hoje exige
  hora inicial futura. A data inicial do formulário vem do dia tocado no calendário.
- **Seletor de data/hora tem duas implementações** (`components/date-time-field.tsx`
  nativo e `.web.tsx` com `<input type=date|time>`), porque o
  `@react-native-community/datetimepicker` não funciona no navegador e o app é PWA.
- **Nome no Mural** vem de `user_metadata.nome_completo` da sessão. Antes era lido
  uma única vez na montagem da tela, ainda sem login, e por isso aparecia o texto
  padrão no primeiro acesso.
- **Responsividade:** largura máxima do app 600px (720px em tablet), modais
  roláveis com largura máxima, áreas seguras via `react-native-safe-area-context`
  e `viewport-fit=cover` em `public/index.html` (PWA). Campos com fonte de 16px
  evitam o zoom automático do iOS ao focar.
