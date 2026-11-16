# Âmbar · Controle de Mesas

Aplicação web para controle de mesas de restaurante, com login (e-mail e Google), anotação de pedidos pelo garçom e painel da cozinha em tempo real. Usa **Supabase** como banco de dados e autenticação.

> Âmbar é um restaurante fictício. Nome e logo foram criados para este projeto.

## Funções

| Função | O que vê |
|---|---|
| **Garçom** | Salão (mapa de mesas), anotação de pedidos com observações por item, comanda, entrega e fechamento de conta |
| **Cozinha** | Kanban de produção: *Na fila → No fogo → Prontos*, com cronômetro de espera e alerta sonoro |
| **Gerência** | Tudo acima, mais a tela **Equipe** para definir a função de cada pessoa |

Todos têm a tela **Perfil**: trocar foto, nome, e-mail e senha, ligar ou desligar os sons e sair (inclusive de todos os aparelhos). **Cozinha** e **Gerência** também acessam o **Cardápio**, onde cadastram produtos com foto, preço, categoria e tempo mínimo e máximo de espera, e marcam itens como indisponíveis.

Na mesa, o garçom ajusta quantos **lugares** ela tem e quantas **pessoas** estão sentadas. Cada pedido mostra a **previsão de preparo**, calculada a partir dos tempos dos produtos. O cronômetro da cozinha fica amarelo ao passar do tempo mínimo e vermelho ao passar do máximo.

**Cadastro:** a primeira conta criada vira **Gerência**. No cadastro por e-mail, cada pessoa escolhe **Garçom** ou **Cozinha**; quem entra pelo Google escolhe no primeiro acesso. A gerência pode mudar a função depois, na tela Equipe. Para garantir que um e-mail sempre entre como Gerência, rode no SQL Editor: `insert into public.emails_gerencia (email) values ('email@exemplo.com');`

## Arquivos

- `index.html`: a aplicação inteira (HTML, CSS e JS num arquivo só)
- `schema.sql`: tabelas, regras de segurança (RLS), funções, armazenamento das fotos (Storage) e dados iniciais (12 mesas e cardápio). Pode ser rodado de novo sem perder dados: ele só acrescenta o que falta.

## Configuração

1. **Banco:** no Supabase, abra **SQL Editor**, cole o conteúdo de `schema.sql` e clique em **Run**.
2. **Chaves:** em `index.html`, preencha `CONFIG.SUPABASE_URL` e `CONFIG.SUPABASE_KEY` (botão **Connect** no topo do projeto, ou *Project Settings → API Keys*). Use só a chave **publishable/anon**, nunca a `service_role`/secret.
3. **URLs de retorno:** em *Authentication → URL Configuration*, defina **Site URL** como `https://pedrofxt.github.io/restaurante/` e adicione a mesma URL em **Redirect URLs**.
4. **Login com Google (opcional):** em *Authentication → Sign In / Providers*, ative **Google** com o Client ID e o Secret criados no Google Cloud. A URL de redirecionamento a cadastrar no Google é `https://SEU-PROJETO.supabase.co/auth/v1/callback`.

Sem as chaves preenchidas, o site roda em **modo demonstração**: os dados ficam só no navegador, e duas abas (uma como Garçom, outra como Cozinha) se sincronizam entre si.

## Publicação

Publicado via GitHub Pages a partir da branch `main`: https://pedrofxt.github.io/restaurante/
