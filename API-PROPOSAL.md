# Предложение по расширению API (v0.2, ЧЕРНОВИК, ждёт согласования)

Файл лежит в `frontend/`, потому что `docs/api.md` фронт сам не меняет. Когда договоритесь, перенесите нужное в `docs/api.md`.
Фронт уже работает на моке по этим форматам (`src/api.js`, каталог в `src/mockCatalog.js`). Все числа временные.

Правило то же: фронт отправляет только ID и число тапов, всё остальное считает сервер.

## Изменения в существующем

- `player`: добавить `streams` (всего прослушиваний). `coins` теперь реально используются.
- `login`: необязательное поле `nickname` в запросе (заполняет `players.username`).
- `get-hand` / `submit-round`: рука собирается только из карточек, которые есть у игрока (стартовая колода + паки).
- `rewards.popularity_change` в победе учитывает бонус `popularity_pct` от надетой одежды.

## Новые коды ошибок

`NOT_ENOUGH_COINS`, `ALREADY_OWNED`, `ITEM_NOT_FOUND`, `NOT_OWNED`, `NO_ENERGY`.

## Бонусы (общий формат)

`"bonus": { "type": "income_pct" | "popularity_pct" | "charisma", "value": 10 }`

- `income_pct`: +N% к доходу от сниппетов.
- `popularity_pct`: +N% к росту популярности (сниппеты и победы в батлах).
- `charisma`: +N к харизме (в расчёт батла пока не входит, решить отдельно).

## Функции

Во всех запросах есть `initData`. Во всех ответах, где менялись монеты или популярность, приходит свежий `player`.

### `get-studio`
Ответ:
```json
{
  "player": { "...": "как в login" },
  "studio": {
    "hype": 12, "hype_max": 50,
    "energy": 80, "energy_max": 100,
    "selected_beat_id": 1,
    "beats": [{ "id": 1, "name": "Бит 1: Дрилл" }],
    "equipment": [{ "id": 1, "name": "Наушники", "price": 500, "bonus": { "type": "income_pct", "value": 10 }, "owned": false }],
    "income_pct": 10
  }
}
```
Энергия восстанавливается по времени на сервере (в моке 1 за 3 секунды).

### `record-snippet`
Запрос: `{ "taps": 17 }` (число тапов, накопленных за короткое время; сервер режет по энергии и лимиту за запрос).
Каждый тап тратит 1 энергию и даёт 1 хайп. Когда хайп доходит до `hype_max`, выходит сниппет:
```
streams = base_streams(бит) * (1 + popularity / 200) * (1 + income_pct / 100)
coins   = round(streams / 10)
popularity += max(1, round(streams / 100 * (1 + popularity_pct / 100)))
```
Ответ: `{ "player": {...}, "studio": {...}, "released": [{ "streams": 105, "coins": 11, "popularity_change": 1 }] }`
Ошибки: `NO_ENERGY`.

### `select-beat`
Запрос: `{ "beatId": 2 }`. Ответ: `{ "player", "studio" }`. Ошибки: `ITEM_NOT_FOUND`.

### `get-shop`
Ответ:
```json
{
  "player": {},
  "equipment": [{ "id": 1, "name": "Наушники", "price": 500, "bonus": {}, "owned": false }],
  "clothing": [{ "id": 1, "slot": "hat", "name": "Винтажная бейсболка", "rarity": "common", "price": 500,
                 "image": "https://.../cap.png", "description": "...", "bonus": {}, "owned": false }],
  "packs": [{ "id": 1, "name": "Базовый пак", "price": 200 }]
}
```
В `clothing` только вещи с ценой. Вещи без цены выпадают только из паков.

### `buy-item`
Запрос: `{ "kind": "equipment" | "clothing", "itemId": 1 }`. Ответ: `{ "player", "item" }`.
Ошибки: `ITEM_NOT_FOUND`, `ALREADY_OWNED`, `NOT_ENOUGH_COINS`. Списание монет и выдача предмета в одной транзакции.

### `get-wardrobe`
Ответ: `{ "player", "items": [...купленная одежда с теми же полями...], "outfit": { "hat": 1, "hoodie": null, "pants": null, "shoe": null, "chain": null }, "bonuses": { "income_pct": 3, "popularity_pct": 0, "charisma": 0 } }`.
Слоты одежды: `hat`, `hoodie`, `pants`, `shoe`, `chain`.

### `equip-item`
Запрос: `{ "slot": "hat", "itemId": 1 }` (`itemId: null` снимает вещь). Ответ: `{ "player", "outfit", "bonuses" }`.
Ошибки: `ITEM_NOT_FOUND` (нет такой вещи или она не для этого слота), `NOT_OWNED`.

### `open-pack`
Запрос: `{ "packId": 1 }`. Списывает цену пака, ролл выдаёт одно:
- карточку (шансы по редкости 70 / 24 / 6, сначала из тех, которых у игрока ещё нет);
- редко (в моке 7%) вещь одежды, которой ещё нет.
Дубликат карточки возвращает часть монет (в моке 20 / 60 / 150 по редкости).
Ответ:
```json
{
  "player": {},
  "drop": { "type": "card", "card": { "id": 103, "slot": "setup", "text": "...", "theme": "деньги", "rarity": "rare", "syllables": 11, "bonus": { "type": "flat_points", "value": 2 } },
            "duplicate": false, "refund": 0 }
}
```
или `{ "type": "clothing", "item": { ...как в get-shop... }, "duplicate": false, "refund": 0 }`.
Ошибки: `ITEM_NOT_FOUND`, `NOT_ENOUGH_COINS`.

### `get-deck`
Ответ: `{ "cards": [{ "id": 140, "slot": "setup", "text": "...", "theme": "...", "rarity": "common", "syllables": 11 }] }` (все карточки игрока).

## Таблицы БД (набросок)

- `beats(id, name, base_streams)`
- `equipment(id, name, price, bonus_type, bonus_value)`
- `clothing(id, slot, name, rarity, price null, image_url, description, bonus_type, bonus_value)`
- `player_equipment(player_id, equipment_id)`
- `player_clothing(player_id, clothing_id)`
- `player_outfit(player_id, slot, clothing_id null)`
- `players`: добавить `streams`, `hype`, `energy`, `energy_updated_at`, `selected_beat_id`
- `player_cards` уже есть: стартовая колода при создании игрока, дальше пополняется паками.
- `packs(id, name, price, clothing_chance)`

Картинки одежды: PNG с прозрачным фоном, один размер для всех (например 512×1024), один ракурс, по слою на слот. Хранить в Supabase Storage, в БД ссылка.
