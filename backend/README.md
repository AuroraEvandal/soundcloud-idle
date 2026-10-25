# Backend: Supabase

В `backend/schema.sql` находится исходная схема проекта, а готовые карточки для старта — в `backend/seed.sql`.
Edge Functions размещены в `supabase/functions/`, настройки их проверки — в `supabase/config.toml`, изменения схемы для уже созданной базы — в `supabase/migrations/`.

## Настройка проекта

1. В Supabase создай проект и выполни `backend/schema.sql` в SQL Editor.
2. Выполни `backend/seed.sql`, чтобы добавить карточки, темы и стартовую колоду.
3. Установи Supabase CLI, выполни `supabase link --project-ref <ID_ПРОЕКТА>`, затем `supabase db push`.
4. Сохрани секреты в Supabase: `TELEGRAM_BOT_TOKEN` и `OPENAI_API_KEY`. По желанию задай `OPENAI_MODEL`.
5. Разверни функции командой `supabase functions deploy`.
6. Добавь во фронтенд `.env` адрес проекта и только публичный `anon`-ключ:

   ```env
   VITE_SUPABASE_URL=https://<ID_ПРОЕКТА>.supabase.co
   VITE_SUPABASE_ANON_KEY=<ПУБЛИЧНЫЙ_ANON_КЛЮЧ>
   ```

Ключ `service_role` не добавляй во фронтенд. Edge Functions используют серверный секрет Supabase и проверяют подпись Telegram `initData`.

## Что реализовано

- `login`, `get-profile`, `get-hand`, `start-battle`, `submit-round`.
- Старт батла и выдача руки выполняются транзакционно в Postgres. У игрока может быть только один активный батл.
- `submit-round` атомарно записывает результат, меняет счёт и выдаёт награды. Повтор того же `requestId` возвращает сохранённый JSON без повторной награды.
- `get-hand` возвращает текущий раунд, руку, счёт и последний результат, поэтому фронт может восстановить батл после перезапуска.
- Рифма и флоу считаются на сервере. Панч и смысл оцениваются моделью OpenAI, которая должна вернуть JSON по строгой схеме. Без `OPENAI_API_KEY` раунд не списывает попытку и возвращает `JUDGE_UNAVAILABLE`.

Остальные функции из чернового `frontend/frontend/API-PROPOSAL.md` пока не реализованы на сервере. Пока они не появятся, не отключай их моки отдельно от MVP API: иначе клиент смешает серверное состояние игрока с локальными заглушками.
