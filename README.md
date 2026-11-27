# Luric.web · Postagem automática no Instagram

Robô que publica os posts da Luric.web no Instagram usando **GitHub Actions** + **API oficial da Meta**. Sem servidor e sem custo.

## Como funciona

1. Cada post é uma pasta em `posts/` com o nome `AAAA-MM-DD-algumacoisa` (a data é a do post).
2. Um workflow roda de hora em hora (8h às 20h de Brasília). Quando chega o horário de um post que ainda não saiu, ele publica e anota em `publicados.json`.
3. As mídias ficam públicas pelo próprio GitHub (via jsDelivr), que é de onde a Meta baixa os arquivos.

```
posts/
  2027-01-05-carrossel/
    legenda.md          ← só o texto da legenda (obrigatório)
    slides/slide-01.png ← carrossel: 2 a 10 imagens, em ordem alfabética
  2027-01-06-reel/
    legenda.md
    reel-2027-01-06.mp4 ← reel: um .mp4 (até 20 MB)
    capa.png            ← opcional: capa do reel
  2027-01-07-estatico/
    legenda.md
    arte.png            ← estático
    post.json           ← opcional
```

`post.json` (opcional):

```json
{ "hora": "09:00", "pausado": false }
```

- `hora`: horário de Brasília. Padrão **10:00**.
- `pausado: true`: o robô pula esse post.

Regras que o robô confere sozinho: legenda até 2200 caracteres, no máximo 5 hashtags, mídias no formato certo. Se algo estiver errado, o check do GitHub fica vermelho e você recebe e-mail.

PNG pode subir normal: o workflow **Preparar e verificar posts** converte pra JPEG (a API só aceita JPEG) e faz commit dos `.jpg`.

## Comandos úteis (rodando no seu computador)

```bash
npm install
npm run preparar    # converte PNG -> JPEG
npm run verificar   # lista todos os posts e aponta problemas
```

No GitHub, em **Actions > Publicar no Instagram > Run workflow** dá pra:
- publicar um post na hora (campo `post`, ex.: `2027-01-05-carrossel`);
- marcar **simular** pra ver o que sairia sem publicar.

Pra republicar um post, apague a entrada dele em `publicados.json`.

---

## Configuração

App na Meta: **LuricPostagens** (ID `2086601232057574`), usando *Instagram API com login do Facebook*.
Conta: `@luric.web`, ID `17841435258862236` (já é o padrão no código).
Permissões do token: `instagram_basic` e `instagram_content_publish`.

No repositório: **Settings > Secrets and variables > Actions**.

| Onde | Nome | Valor | Obrigatório |
|---|---|---|---|
| Secrets | `IG_ACCESS_TOKEN` | o token `EAA...` | sim |
| Secrets | `APP_SECRET` | chave secreta do app (Meta > Configurações do app > Básico) | só se o token expira |
| Secrets | `GH_PAT` | token do GitHub com **Secrets: Read and write** neste repo | só se o token expira |

Padrões que dá pra mudar em **Variables**: `GRAPH_VERSION` (v21.0), `IG_USER_ID`, `APP_ID`.

### O token expira?

Cole o token no [Depurador de token](https://developers.facebook.com/tools/debug/accesstoken/) e veja **Expira em**:
- **Nunca**: pronto, só o `IG_ACCESS_TOKEN` basta.
- **Data**: cadastre `APP_SECRET` e `GH_PAT`. O workflow **Conferir token do Instagram** roda toda segunda, troca por um token novo e salva sozinho.

Em qualquer caso, esse workflow confere o token toda segunda e te avisa por e-mail se ele parou de funcionar.

### Testar

**Actions > Conferir token do Instagram > Run workflow**: tem que aparecer "Token ok, conectado em @luric.web".
Depois, **Actions > Publicar no Instagram > Run workflow** com **simular** marcado.

## Atenção com o Buffer

Se um post estiver aqui **e** agendado no Buffer, ele sai duas vezes. Os posts de 01/12 a 21/12 estão agendados no Buffer e por isso **não** estão aqui. Daqui pra frente, cada post fica em um lugar só.

## Painel

A fila fica visível em **https://luuizz.github.io/luric-instagram/** (calendário com prévia de cada post, legenda e status).
Pra ligar (uma vez só): **Settings > Pages > Build and deployment > Source: GitHub Actions**. Depois rode **Actions > Painel (GitHub Pages) > Run workflow**.
O painel se atualiza sozinho quando entram posts novos, e o status "publicado" é lido ao vivo.
