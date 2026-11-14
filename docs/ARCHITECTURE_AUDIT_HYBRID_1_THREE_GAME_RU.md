# Архитектурный аудит SDK hybrid.1 и его применения в three-game

Дата: 10 ноября 2026 года.

**Основная версия аудита — `three-game/packages/engine`, `0.0.13-hybrid.1`. По уточнению владельца проекта именно она рассматривается как будущая основа master.** Код `sdk` версии `0.0.12` использован только для сравнения; его уже исправленные недостатки не приписываются hybrid.1.

**Вывод: архитектура в целом здравая, продолжать её развитие стоит. Переписывание движка, переход на ECS или создание ещё одного универсального слоя не нужны. До переноса в master я бы исправил несколько конкретных дефектов lifecycle и ошибок, закрепил контракты тестами и согласовал пакетную поставку.** Следующие полезные расширения уже видны в игре: presentation-фаза, владение подписками и ресурсами, instancing, координатная проекция и доступная диагностика.

Документ содержит только анализ и рекомендации. Исходники, конфигурации и зависимости не изменялись. Единственное постоянное добавление в репозиторий — этот отчёт.

## 1. Наиболее важные находки

Приоритеты здесь означают:

- **P1** — исправить до использования hybrid.1 как общей основы: нарушается освобождение ресурсов или обработка ошибок.
- **P2** — конкретный дефект контракта либо существенный архитектурный долг; исправлять адресно, с учётом сценария.
- **P3** — улучшение сопровождения или эргономики; не причина задерживать развитие продукта.

«Воспроизведено» означает отдельную проверку реальных классов из исходников hybrid.1 в Node.js, с подставленными внешними зависимостями. Это не проверка WebGL в браузере.

| ID | Приоритет | Проблема | Основание |
| --- | --- | --- | --- |
| A1 | P1 | Ошибка входа одного scene service оставляет уже вошедшие сервисы без rollback | Воспроизведено; подтверждено цепочкой `BaseScene → SceneServiceHost` |
| A2 | P1 | Исключение в `onDisable` обрывает освобождение остальных компонентов; ошибки detach подавляются | Воспроизведено |
| A3 | P1 | EventBus не перехватывает rejected Promise; event bridge также создаёт необработанный rejection | EventBus воспроизведён; bridge проверен по реализации |
| A4 | P2 | Timeout lifecycle не отменяет выполнение hook; rollback может идти одновременно с поздним завершением входа | Воспроизведено на `SceneManager`; в `BaseScene` есть частичные защиты |
| A5 | P2 | Общий lifecycle Engine не защищён от конкурентного `init/start` и не согласован с `destroy` | Двойной `init` воспроизведён; остальные ограничения видны в контракте |
| A6 | P2 | DI override после первого resolve singleton возвращает старый экземпляр | Воспроизведено |
| A7 | P2 | Два публичных пути сохранений имеют разную политику источника данных; игра использует смешивающий путь | Смешивание local/platform воспроизведено; call site проверен |
| A8 | P2 | Загрузчик теряет причины ошибок; загрузка списка обязательных assets не имеет строгого результата | Воспроизведено; для bundles строгий путь уже существует |
| A9 | P2 | GPU/CPU assets накапливаются между уровнями до уничтожения всего Engine | Статический анализ ownership и реального каталога десяти уровней |
| A10 | P2 | Порядок presentation реализован внутри игрового сервиса вместо отдельного runtime-контракта | Конкретные call sites camera/world/HUD |
| A11 | P2 | HUD объединяет несколько независимых обязанностей, диагностика требует подмены методов runtime | Разбор `IslandHudComponent` и `CampaignProfiler` |
| A12 | P3 | Документация и release-контур отстают от фактической hybrid-ветки | Сравнение manifest, исходников, README и существующего CI |

### A1. Нет транзакционного входа scene services

Источники: [SceneServiceHost.init](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/scenes/SceneServiceHost.ts:32), [SceneServiceHost.dispose](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/scenes/SceneServiceHost.ts:100), [BaseScene.initSceneServices](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/scenes/BaseScene.ts:295).

`SceneServiceHost` последовательно вызывает `onSceneEnter`, но переводится в `running` только после успешного входа всех сервисов. Если второй сервис падает, первый уже мог открыть физический мир, подписаться на события или создать другие ресурсы. Обратного вызова `onSceneExit` для него нет. В состоянии `idle` метод `dispose` сам выбрасывает ошибку.

Дополнительно `BaseScene` присваивает `this.serviceHost = host` только после `await host.init(...)`. Поэтому даже существующий rollback сцены не получает ссылку на частично инициализированный host.

**Воспроизведение:** сервис A успешно входит, B бросает исключение; `init` отклоняется, `dispose` отклоняется как вызванный до инициализации, `onSceneExit` сервиса A не вызывается.

В игре это не отвлечённый случай: `HoleSceneDi` регистрирует `CannonSceneService`, `HoleProgressService`, затем `HoleService`. `HoleService` создаёт мир и симуляцию в процессе входа. Ошибка после создания мира должна гарантированно проходить по пути освобождения.

**Рекомендация:** host должен владеть начатой инициализацией с первого вызова, учитывать успешно вошедшие сервисы и выполнять обратный rollback. Для сервиса, упавшего в середине собственного enter, нужен явный контракт: либо host вызывает его безопасный partial-exit, либо сам сервис транзакционно освобождает всё созданное до ошибки. Контекст должен оставаться доступным до окончания cleanup. Ссылку на host необходимо учитывать и при незавершённом входе.

Не стоит решать это повторяющимися `try/catch` в каждом game service: базовая гарантия принадлежит SDK.

### A2. Cleanup компонентов не выдерживает ошибку одного участника

Источники: [NodeComponents.destroy](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/layouts/nodes/internal/NodeComponents.ts:110), [NodeActions.destroy](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/layouts/nodes/internal/NodeActions.ts:77), [нейтральный NodeBase](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/layouts/NodeBase.ts:65).

Внешний `NodeBase.dispose` уже собирает ошибки и продолжает освобождение других частей узла. Но внутри `NodeComponents.destroy` вызовы `disable()` стоят вне защиты. Если `onDisable` первого компонента бросает, остальные disable, все detach и очистка коллекции не выполняются.

Воспроизведение с двумя компонентами дало только один вызов `disable:A`; `disable:B` и оба `onDetach` не произошли.

Другая сторона проблемы: ошибки `onDetach`/`completeDetach` у компонентов и actions полностью проглатываются. В результате внешний агрегатор может сообщить об успешном уничтожении, хотя компонент не освободил свои GPU-ресурсы или подписки.

**Рекомендация:** выполнять все шаги cleanup каждого участника независимо, в конце возвращать `AggregateError`. Явно определить порядок disable/detach и повторное уничтожение. Игнорирование ожидаемой отмены допустимо; молчаливое подавление произвольных ошибок освобождения — нет.

### A3. Обещание безопасного EventBus не выполняется для async handlers

Источники: [EventBus.emit](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/events/EventBus.ts:25), [EventHandler](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/events/types.ts:40), [EngineEventBridge.forwardEventToActiveSceneFSM](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/core/EngineEventBridge.ts:47), [BaseCommand.runDetached](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/commands/BaseCommand.ts).

`EventHandler` официально допускает `Promise<void>`, но `emit` выполняет `void h(evt)` внутри обычного `try/catch`. Синхронный throw перехватывается, rejected Promise — нет. Проверка с `async () => { throw ... }` зарегистрировала `unhandledRejection`.

В event bridge `.catch(...)` повторно бросает новую ошибку внутри Promise, результат которого отбрасывается через `void`. Это также не передаёт ошибку в контролируемый канал. Похожая проблема есть у `BaseCommand.executeDetached`: при активной сцене он повторно бросает ошибку, а вызывающая сторона не наблюдает Promise.

**Рекомендация:** сохранить синхронный, неблокирующий `emit`, но явно наблюдать результаты async handlers. Добавить узкий канал ошибок runtime с контекстом subsystem/event/command и последовательно использовать его для фоновых операций. Не нужно превращать каждый `emit` в `await`: это поменяет семантику ввода и увеличит риск циклов ожидания.

### A4. Timeout не означает отмену lifecycle

Источники: [SceneManager.runHookWithTimeout](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/scenes/SceneManager.ts:432), [SceneManager.runEnter](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/scenes/SceneManager.ts:382), [BaseScene.onEnter](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/scenes/BaseScene.ts:92).

`Promise.race` ограничивает ожидание менеджера, но не выполнение `onEnter`. После timeout менеджер вызывает rollback через `onExit`, пока исходный async hook может продолжать работать.

**Воспроизведение:** timeout 5 мс, `onEnter` завершается через 25 мс. Переход отклоняется, `onExit` уже вызван, после этого оставшаяся часть `onEnter` всё равно выполняется.

Это само по себе обычное свойство Promise; дефект — в отсутствии полного контракта, который запрещает поздние side effects. В `BaseScene` уже есть проверки `this.disposal` после загрузки layout, входа сервисов и warmup. Это полезно, но не отменяет выполняющийся service hook. При timeout внутри `host.init` cleanup может увидеть ещё не присвоенный `serviceHost`; позднее присваивание происходит уже после snapshot ресурсов, сделанного `disposeScene`.

**Рекомендация:** scene scope с признаком истечения/generation и `AbortSignal`, доступный lifecycle hooks и асинхронным загрузкам. Все SDK-owned точки передачи ownership должны проверять scope. Ресурс, полученный после отмены, немедленно освобождается. Для уже существующих hooks можно добавить сигнал в контекст без требования немедленно переписать все игры.

Timeout — диагностический предел, а не подтверждение, что незавершённая операция остановлена. Не следует просто увеличивать его, скрывая гонку.

### A5. Engine lifecycle нуждается в защите конкурентных операций

Источники: [EngineLifecycleManager](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/core/EngineLifecycleManager.ts:5), [Engine.destroy](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/core/Engine.ts:118).

Состояние меняется после `await`. Два одновременных `init()` видят `created` и оба запускают инициализацию; это воспроизведено непосредственно на lifecycle manager. Аналогичная структура есть у `start`.

В `Engine.destroy` уже есть правильная идемпотентность через сохранённый Promise, но lifecycle manager не знает состояний `initializing`, `starting`, `disposing`, `disposed`. Внешний API не задаёт полноценную семантику `destroy` во время запуска и последующих `init/mount/start`.

**Рекомендация:** одна небольшая state machine жизненного цикла. Для повторного одновременного вызова выбрать документированную политику: общий Promise либо немедленный fail-fast. Важно не смешивать эти подходы случайно. После destroy новые операции должны отклоняться на границе Engine с понятной ошибкой; уже начатые — завершаться по scope/cancellation-контракту.

Не требуется делать любой метод безусловно идемпотентным. Повторный `destroy` безопасен; повторный несовместимый `start` может корректно считаться ошибкой.

### A6. DI override не инвалидирует singleton cache

Источник: [DiContainer.register/get](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/di/DiContainer.ts:17).

Последовательность `register(singleton=1) → get → register(singleton=2, override=true) → get` возвращает `1`. Provider обновился, cache остался прежним. Воспроизведено на hybrid.1.

Это не текущая ошибка механики Hole, а дефект публичного контракта DI: результат зависит от того, успел ли кто-то разрешить зависимость до override.

**Рекомендация:** предпочтительно запретить замену уже разрешённого singleton и зафиксировать состав DI после bootstrap. Если hot override действительно нужен, необходимы явная инвалидизация и политика освобождения старого экземпляра. Простое удаление cache без обсуждения владельца ресурса тоже неполное решение.

Отдельный небольшой долг DI — отсутствие диагностики циклического resolve. Оно не требует другого контейнера: достаточно стека разрешаемых токенов и ошибки с цепочкой.

### A7. Политика сохранений неоднозначна, а её владелец глобален

Источники: [HoleProgressService.onSceneEnter](/Users/alexandr/projects/repositories/projects/three-game/game/src/scenes/hole/services/HoleProgressService.ts:43), [PersistentStorageBackendResolver](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/configs/services/internal/PersistentStorageBackendResolver.ts), [WriteThroughPlatformPersistentStorageBackend](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/configs/services/internal/WriteThroughPlatformPersistentStorageBackend.ts:12), [PlatformStorageAdapter](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/configs/services/PlatformStorageAdapter.ts), [PersistentStorageCoordinator](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/configs/services/PersistentStorageCoordinator.ts:20).

В SDK одновременно существуют две существенно разные семантики:

1. `PlatformStorageAdapter` использует platform backend эксклюзивно, когда он доступен; иначе — browser storage.
2. `PersistentStorageAdapter` через общий coordinator может объединять browser/platform записи, подставлять browser-значение при отсутствующем platform key и писать в оба источника.

`three-game` выбирает второй путь. В `GameConfiguration` задан namespace, browser backends остаются включёнными по умолчанию. В отдельной проверке доступное, но пустое platform storage получило старую локальную запись через merge/fallback. Последующая запись направилась в оба backend.

**Риск:** игра может принять локальный прогресс за прогресс текущего platform-пользователя, хотя отсутствие ключа на платформе может быть значимым. Это риск семантики данных; фактическое смешивание аккаунтов на реальном портале в рамках аудита не проверялось. В README основного SDK для CrazyGames описан именно эксклюзивный путь.

Кроме того, `PersistentStorageCoordinator.shared()` — глобальный изменяемый singleton. Настройка другого Engine меняет coordinator уже созданных adapters. Это ухудшает изоляцию тестов, remount и запуск нескольких экземпляров.

**Рекомендация:** Engine владеет persistence service, а игра получает adapter через DI. Backend policy задаётся явно: platform-exclusive либо намеренный локальный mirror с определённой стратегией согласования. Изменение политики существующих сохранений требует миграционного решения, а не молчаливой замены adapter.

В самой игре стоит постепенно заменить специальную ветку для `fruit-lagoon-01-v5` общей таблицей результатов уровней. Старую схему сохранить через явную миграцию. Монеты, награды и понятие «уровень пройден» остаются игровой логикой.

### A8. Ошибки загрузки скрываются слишком рано

Источники: [AssetLoadCoordinator.loadDescriptors](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/assets/internal/LoadCoordinator.ts:32), [AssetManager.load/loadRequiredBundle](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/assets/AssetManager.ts), [BaseScene.preload](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/scenes/BaseScene.ts:74).

Coordinator подавляет исключения loader; отсутствие loader тоже молча пропускается. `assets.load(ids)` успешно завершается с незагруженными ресурсами. `loadRequiredBundle` затем обнаруживает отсутствие ресурса, но исходная причина — например ошибка разбора GLB — потеряна.

Это воспроизведено с loader, бросающим конкретную ошибку: `load` resolved, `has` вернул false, ошибка строгого bundle не содержала первоначальный `cause`.

В hybrid.1 boot и preload bundles уже используют `loadRequiredBundle`; это правильное улучшение. Но `BaseScene.preload` для `assets.ids` вызывает обычный `load`. Именно списками IDs игра загружает модели отдельных уровней. Ошибка обнаружится позднее, при построении presentation/layout, с менее точным контекстом.

**Рекомендация:** добавить минимальный строгий путь `loadRequired(ids, options?)` либо явный результат пакетной загрузки с ошибками по ID. Сохранить permissive API для действительно необязательных ресурсов. Строгий путь обязан сохранять loader cause, ID и этап. Полезно передавать cancellation signal и валидировать параметры concurrency/retry на входе.

### A9. Между уровнями нет управляемого освобождения assets

Источники: [AssetManager](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/assets/AssetManager.ts), [AssetStore](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/assets/internal/Store.ts), [ModelAsset](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/renderers/three/ModelAsset.ts), [HoleCampaignCatalog](/Users/alexandr/projects/repositories/projects/three-game/game/src/scenes/hole/HoleCampaignCatalog.ts), [campaign.json](/Users/alexandr/projects/repositories/projects/three-game/game/assets/json/configs/hole/campaign.json).

Владение экземплярами GLB организовано хорошо: `ModelAsset.acquire()` выдаёт отдельную transform hierarchy, разделяет геометрию/material/texture и считает leases. `release()` идемпотентен, dispose с живыми leases отклоняется.

Но release экземпляра не освобождает сам asset. Публичный `AssetManager` хранит загруженное до общего `destroy`; scene eviction намеренно отсутствует. При последовательном прохождении кампании модели предыдущих уровней остаются в памяти.

В актуальном каталоге десяти уровней — **40 уникальных GLB суммарно около 16,63 MiB файлов**. Это размер файлов на диске, не расход RAM/VRAM; decoded textures и GPU buffers требуют отдельного измерения. В уровнях 8–10 соответственно 523, 616 и 493 entities. Уже есть реальный сценарий для контроля lifetime ресурсов.

**Рекомендация:** следующий шаг — явное освобождение неиспользуемого asset/bundle с проверкой владельцев; затем, если нужно, небольшой cache budget. Общие UI/audio/модели могут иметь engine scope, остальные — scene/group scope. Не следует автоматически уничтожать все assets на каждом переходе: это сломает разделяемые ресурсы и создаст лишние загрузки.

### A10. Presentation-порядок приходится создавать в игровом сервисе

Источники: [HoleService.onSceneTick/onPresentation](/Users/alexandr/projects/repositories/projects/three-game/game/src/scenes/hole/services/HoleService.ts:27), [HoleSceneDi](/Users/alexandr/projects/repositories/projects/three-game/game/src/scenes/hole/HoleSceneDi.ts), [RuntimeSystemPhaseOrder](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/src/runtime/RuntimeSystemPhase.ts), [HoleCameraComponent](/Users/alexandr/projects/repositories/projects/three-game/game/src/scenes/hole/components/HoleCameraComponent.ts:39), [IslandHudComponent.onReady](/Users/alexandr/projects/repositories/projects/three-game/game/src/scenes/hole/ui/IslandHudComponent.ts:132).

Для корректного кадра игра использует две договорённости:

- `CannonSceneService` зарегистрирован перед `HoleService`, оба работают в фазе `physics`.
- `HoleService` сам сортирует presentation callbacks: camera `-100`, обычные world-компоненты `0`, HUD `100`.

Так достигается нужный порядок: fixed physics → interpolated snapshot → camera → world effects → HUD projection. Это разумная реализация для одной игры, но здесь явно появилась универсальная обязанность scheduler.

В SDK существующий порядок — `layout → scene → physics → particles → tweens`. Обычный component update происходит до physics, поэтому им нельзя просто заменить текущие callbacks без изменения момента чтения snapshot.

**Рекомендация:** добавить owner-scoped подписки на post-physics/presentation этап с документированным порядком camera/world/UI либо небольшим явным ordering-контрактом. Определить положение tweens относительно presentation. Game service должен предоставлять данные симуляции, а не становиться ещё одним scheduler.

При этом не стоит создавать общий граф зависимостей задач или переносить правила сбора фруктов в runtime. Достаточно закрыть существующие три стадии presentation.

### A11. В consumer остались места, где инфраструктура мешает простоте

Источники: [IslandHudComponent](/Users/alexandr/projects/repositories/projects/three-game/game/src/scenes/hole/ui/IslandHudComponent.ts), [CampaignProfiler](/Users/alexandr/projects/repositories/projects/three-game/game/src/validation/CampaignProfiler.ts:10), [HoleCollectiblesComponent](/Users/alexandr/projects/repositories/projects/three-game/game/src/scenes/hole/components/HoleCollectiblesComponent.ts:29).

`IslandHudComponent` — 597 строк. Сам размер не является нарушением, но обязанности действительно независимы: responsive layout, состояние pause/results, клавиатурный focus, ARIA, проекция Three→Pixi, goal cards и два feedback pools. Также он знает конкретные paths чужих узлов и native Three camera.

**Рекомендация для игры:** оставить небольшой HUD coordinator, а layout, modal/focus и pickup feedback выделить в владельцев соответствующих поддеревьев. `IslandModalMotionComponent`, `IslandGoalComponent` и `IslandButtonComponent` уже показывают нужное направление. Не нужно дробить каждую строковую операцию в отдельный класс.

`CampaignProfiler` переопределяет `engine.rendering.renderFrame`, `physics.onSceneTick` и `game.onSceneTick`, затем восстанавливает их. Для dev-инструмента это рабочий приём, но это прямое свидетельство отсутствующего diagnostic hook SDK. Предлагаемый tracing API должен давать CPU samples без подмены методов и различать CPU submission, GPU execution и доставленную частоту кадров.

`HoleCollectiblesComponent` вручную выполняет generic instancing: группирует entities по model asset, извлекает mesh primitives, сохраняет локальные матрицы, создаёт `InstancedMesh`, обновляет instance matrices и освобождает buffers/lease. Эта инфраструктура пригодится другим Three-играм; её стоит вынести в Three-модуль SDK, сохранив выбор entities и связь с физикой в игре.

### A12. Источник истины и release-контур надо привести к одной версии

Источники: [SOURCE.md](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/SOURCE.md), [hybrid README](/Users/alexandr/projects/repositories/projects/three-game/packages/engine/README.md), [README игры](/Users/alexandr/projects/repositories/projects/three-game/README.md), [GameConfiguration](/Users/alexandr/projects/repositories/projects/three-game/game/src/config/GameConfiguration.ts), [SDK CI](/Users/alexandr/projects/repositories/projects/sdk/.github/workflows/ci.yml).

Игра подключает локальный workspace engine, отдельный source-пакет Cannon и vendor tarball tooling. Это допустимо для экспериментальной ветки. Но состояние `sdk-three`, игра и опубликованный `sdk` уже различаются; перенос одного каталога `src` не соберёт согласованный SDK.

Документация содержит заметные устаревшие утверждения: README игры описывает один реализованный уровень, хотя текущий `campaign.json` публикует 1–10; начало engine README говорит о `0.0.13-three.5`, manifest — о `0.0.13-hybrid.1`. Это снижает доверие к описанию контрактов сильнее, чем неидеальные имена отдельных классов.

**Рекомендация:** при интеграции перенести согласованный набор source, exports/types, build scripts, template, tests и документацию. Закрепить единственную точку разработки SDK; game-local копию после перехода на проверенный пакет перестать развивать параллельно. Для совместимости проверить существующие Pixi consumers и явно описать переход к обязательному `system.renderer` и renderer-specific imports.

## 2. Границы и метод аудита

### Что проверено

- Общая структура всех 360 TypeScript-файлов локального engine: около 26 299 строк, включая types и barrels.
- Публичные exports, package manifest и сборка declarations/chunks.
- Lifecycle Engine, scenes, services, nodes, components/actions и async continuations.
- Runtime scheduler, ввод, rendering ports и композиция Pixi/Three/hybrid.
- Assets, prefabs, схемы, DI, persistence, audio, platforms, physics, particles, screen и tween.
- 54 TypeScript-файла игры: около 4 667 строк; основные цепочки управления, domain, services, visual/UI/input components и диагностические call sites.
- Отдельный physics-cannon: 10 source-файлов, около 694 строк.
- Tooling `packages/vite/src`: 17 файлов, около 743 строк. В `sdk` и `sdk-three` исходники этого каталога совпадают; отличаются package metadata и часть шаблона.
- JSON-каталог кампании и характер загрузки models/layout/prefabs/configs.
- Существующие tests и CI/release scripts в объёме, необходимом для оценки архитектурных гарантий.

Это архитектурный аудит с полным структурным охватом модулей и углублённым разбором основных runtime-путей, а не обещание обнаружить каждый баг каждой строки, shader, asset или сторонней библиотеки.

### Состояние рабочей копии

`sdk` и `sdk-three` указывают на HEAD `7148966`, `three-game` — `a0f015e`. При этом `sdk-three` и `three-game` содержат существенные незакоммиченные изменения; локальный engine игры находится среди untracked файлов. Поэтому выводы относятся **к файлам рабочей копии на момент аудита**, а не только к указанным commit SHA.

В частности, уже нельзя использовать старые архитектурные документы как доказательство, что игра состоит из одного уровня. Для выводов приоритет отдан текущим manifest, public barrels и исполняемому коду.

### Выполненные проверки

| Проверка | Результат |
| --- | --- |
| `three-game`: engine `tsc --noEmit -p packages/engine/tsconfig.json` | Пройдено |
| `three-game`: game `tsc --noEmit -p tsconfig.json` | Пройдено |
| `three-game`: Cannon `tsc --noEmit -p packages/physics-cannon/tsconfig.json` | Пройдено |
| `three-game`: `npm run lint` | Пройдено, без warnings |
| `three-game`: `npm test` | 115/115 тестов игры и 9/9 тестов локального engine |
| Сравнительный `sdk`: `tsc --noEmit` engine и Vite tooling | Пройдено |
| Отдельные проверки исходников hybrid.1 | Подтверждены A1–A6 в указанных пределах, поведение загрузки A8 и merge backend из A7 |
| Контроль исправленных отличий от 0.0.12 | `pop` восстанавливает DI/FSM; неудачный replace не оставляет вышедшую сцену активной |
| Структурный AST-анализ imports | В игровом source не обнаружены deep imports engine internals |

Команды TypeScript запускались напрямую, чтобы не вызывать `pretypecheck` tooling, который пересобирает engine. Новые тестовые файлы в репозитории не создавались: отдельные воспроизведения собирались в памяти.

Чистая production build, установка упакованных пакетов в новый consumer, браузер, dev server и реальные устройства не запускались. Игровые тесты используют уже существующий package distribution в `dist` там, где импортируют установленный engine; engine tests и отдельные audit-проверки обращаются к source. Поэтому этот прогон не заменяет проверку согласованной чистой сборки перед merge.

## 3. Насколько SDK соответствует Clean Architecture

### Общая оценка

Это **модульный игровой framework с портами и backend adapters**, а не образцовая многоуровневая enterprise-система. Для такой задачи выбранная форма уместна.

Clean Architecture полезна здесь прежде всего как правило направления зависимостей и владения состоянием: игровые правила не зависят от renderer/storage, adapters реализуют внешние технологии, orchestration не теряет cleanup. Наличие папки `domain` или большого количества интерфейсов само по себе ничего не гарантирует.

В hybrid.1 основная граница уже проведена правильно:

```text
Game domain
    ↑
Game use cases / scene services
    ↑                       ↑
Commands / FSM        Node components / actions
    │                       │
    └──── SDK contracts ────┘
              ↑
    Pixi / Three / audio / platform adapters
```

Стрелки вверх обозначают зависимость внешнего участника от внутренних правил/контрактов. Composition root вправе знать конкретные реализации и соединять их.

На практике есть широкие runtime contexts и обращение к DI через `node.engine`. Это service-locator-подход на границе framework. Он уменьшает явность зависимостей, но **не делает игру архитектурно плохой**, пока не проникает в domain. Не стоит заменять его сотнями формальных constructor interfaces. Узкие зависимости нужны там, где облегчают тесты, изоляцию и повторное использование.

### Что сделано хорошо

1. **Renderer-neutral ownership уже существует.** Нейтральный `layouts/NodeBase` владеет поведением и logical children; конкретные nodes владеют native views. Core больше не обязан создавать Pixi `Application`.
2. **Гибридная композиция честная.** Два canvas, два native дерева, единый frame driver и input routing. Three и Pixi children не смешиваются в одном native parent. UI-first hit testing реализован явно.
3. **Домен не знает renderer/physics runtime.** `HoleSession`, `HoleBoosters`, `HoleBoundary`, `HoleNavigation` не импортируют исполняемые SDK, Three, Cannon или DOM. Type-only зависимости от уровня схем не создают runtime coupling.
4. **Есть реальные ownership-контракты.** GLB leases, собственные материалы компонентов, bounded FX pools, node-owned tweens, scope checks для async continuation.
5. **Схемы работают на границе данных.** Config, command input, components и Three props декодируются; domain validators отдельно проверяют связи и инварианты.
6. **DI и orchestration детерминированы.** Явная регистрация, transient commands, scene-scoped services; нет reflection, decorators и скрытого discovery.
7. **Audio/platform сложности находятся в SDK.** Восстановление autoplay, remembered music intent, channel/platform mute и ad hooks не разнесены по сценам.
8. **Тесты проверяют содержательное поведение.** Есть проверки уникального сбора, квот, fixed-step physics, полного освобождения тела, instancing leases, modal replay/cancellation и renderer warmup.

AST-проверка не нашла `any` в source engine и игры; в игре также нет non-null assertions. В engine осталось шесть non-null assertions. Это хорошая дисциплина, но отсутствие `any` не отменяет небезопасность произвольного `get<T>(id)` без runtime-проверки.

### Где правила стоит применять прагматичнее

- **SRP:** выделять части по разным причинам изменения, как в HUD, а не из-за числа строк. Engine может быть большим composition facade и при этом иметь связную ответственность.
- **DIP/ISP:** полезно сузить зависимости конкретного service от storage/physics. Не нужно создавать интерфейс для каждого getter SDK.
- **OCP:** новая renderer integration оправдывает port и module registration. Динамическая смена renderer на лету пока не имеет потребителя.
- **DRY:** общий disposal scope и instancing убирают повторяющуюся инфраструктуру. Один и тот же числовой clamp в независимых domain-операциях не требует универсального математического сервиса.
- **CQS:** `spawn` и `ensure` сейчас различаются хорошо. Fluent API анимации может совмещать команду и возврат handle — это полезный контракт, не нарушение само по себе.
- **Fail-fast:** нужен на нарушениях обязательных контрактов. Отсутствие рекламной возможности на web, повреждённый старый save и запрещённый autoplay требуют осмысленной recovery policy, а не одинакового throw во всех случаях.
- **OOP:** классы оправданы для lifecycle, состояния и ресурсов. Набор tiny static classes для каждого чистого преобразования не делает архитектуру чище автоматически; массово менять установленный стиль ради этого не нужно.

## 4. Карта подсистем SDK

| Подсистема | Оценка границы | Что сохранить / что улучшить |
| --- | --- | --- |
| `core` | Хороший composition root, но lifecycle неполон | Сохранить factory/boot pipeline; закрыть A4–A5, не дробить Engine ради размера |
| `rendering` | Правильная новая граница | Сохранить neutral ports; `RendererModule` лучше зависеть от узкой регистрации, если появится внешний renderer plugin |
| `renderers/pixi` | Изолированная публичная поверхность | Удобно, что конкретные UI nodes вынесены в renderer barrel; физический Matter manager не должен концептуально определяться наличием Pixi |
| `renderers/three` | Хороший минимальный backend | Довести generic instancing, resource helpers; документировать ограничения статического GLB |
| `renderers/hybrid` | Практичная композиция | Сохранить два дерева и UI-first порядок; разные pixel budgets для world/UI добавлять после замеров |
| `assets` | Сильная основа, неполные error/lifetime контракты | Single-flight/retry сохранить; A8–A9, cancellation, typed/resource-specific access |
| `di` | Простой и понятный | Исправить override, добавить диагностику cycles; не внедрять reflection |
| `events` | Маленький API с конкретной ошибкой async | A3; typed event map — возможная поздняя надстройка, не замена decoder |
| `commands` | Хорошо отражает use cases | Сохранить transient и scope guards; убрать необработанные detached errors |
| `fsm` | Умеренная сложность, явная очередь | Сохранить последовательность; результат command refusal и переход FSM должны быть согласованы игрой |
| `scenes` | Сильные recovery-наработки, главный остаточный риск | Уже есть restore/rollback/destroy; завершить partial-service и cancellation semantics |
| `runtime` | Детерминированный scheduler | Добавить presentation hook и diagnostics; не создавать второй scheduler в игре |
| `layouts` | Ownership и авторинг разделены удачно | Сохранить neutral base; renderer-specific файлы физически ещё лежат в `layouts/nodes` — это навигационный долг, не причина переписывать runtime |
| `prefabs` | Хорошие strict/ensure semantics | Single-flight ensure, проверка истёкшего scene/parent, rollback и освобождение ID уже есть; заново изобретать их не нужно |
| `input` | Корректная общая маршрутизация pointer | Добавить reusable keyboard/stick intent scopes; стилизация hit area/cursor остаётся в Pixi adapter/component |
| `screen` | Нужная самостоятельная инфраструктура | Сохранить virtual/CSS/backing coordinates; расширить явными projection helpers |
| `tween` | Backend скрыт, ownership поддержан | Общий seconds-based clock и kill/completion сохранить; формализовать cancellation outcome только при нужном use case |
| `configs` / `validation` | Схемы и type inference полезны | Не превращать generic `get<T>` в замену декодированию; решить persistence policy/instance ownership |
| `audio` | Сложность в основном оправдана браузерной средой | Сохранить backend/policies и volume JSON; расширять regression matrix, не переносить recovery в игру |
| `platforms` | Верное место для portal adapters | Инфраструктурный no-op допустим; ошибки запуска/недоступности должны быть наблюдаемы через diagnostics |
| `particles` | Достаточно отделённый Pixi backend | Three FX пока честно принадлежат компоненту; общий VFX framework без повторных потребителей не нужен |
| `physics` / `physics-cannon` | Отдельный Cannon package — правильное направление | Не объединять 2D/3D в огромный интерфейс; общими делать clock/lifecycle/pose contracts, где они совпадают |
| `interactions` | Переиспользуемый drag слой имеет смысл | Не расширять его до всех игровых интеракций; stick/keyboard можно добавить небольшими независимыми блоками |
| `errors` | Единый формат уже есть | Нужен наблюдаемый error sink; не добавлять ещё один параллельный формат ошибок |
| `vite` / CLI / packaging | Небольшая понятная tooling-подсистема | Согласовать exports/templates с hybrid; runtime dependency ради schema/catalog ограничить neutral entrypoints |

Файлы, физически лежащие под `layouts`, но являющиеся Pixi implementation, не означают, что public neutral barrel уже загружает Pixi: в hybrid.1 neutral exports очищены, renderer entrypoints и chunks разделены. Реорганизация каталогов полезна для ясности, но важнее проверить фактический dependency graph и состав пакета.

## 5. Оценка архитектуры three-game

### Текущая цепочка ответственности

```text
Pointer / keyboard / UI
  → typed intent
  → FSM
  → Command
  → HoleService
  → HoleSimulation + HoleSession
  → committed snapshot/events
  → camera / world components / HUD / audio
```

`HoleScene` пустой наследник `FsmDrivenScene` — это нормально: scene не превращена в менеджер всего проекта. Команды не содержат физику и остаются короткими адаптерами use cases. `HoleService` владеет попыткой и связывает domain, physics, progress и platform signals. `HoleSimulation` — integration/application слой, а не «чистый domain», и зависимость от Cannon здесь естественна.

`HoleSession` хранит правила игры, состояние, время и committed events. Его type-only зависимость от `HoleLevelSchema` означает связь с формой конфигурации, но не исполняемую зависимость от SDK validator. Если domain начнут использовать отдельно, можно вынести чистые level contracts. Сейчас это не первоочередной рефакторинг.

Нативные Three/Pixi операции внутри компонентов допустимы: именно компоненты являются presentation adapters. Например, создание shader material в `HoleWaterComponent` не надо объявлять нарушением Clean Architecture и выносить в service. При этом generic resource ownership можно упростить средствами SDK.

### Что рефакторить в игре

1. **Разделить HUD по ownership поддеревьев.** Layout/reflow, modal + focus, pickup feedback/projection. Сохранить небольшой coordinator состояния экрана.
2. **Ввести явную миграцию прогресса.** Выровнять модель результатов уровня 1 и остальных уровней; не терять старый namespace и сохранения.
3. **После появления SDK presentation API удалить собственную очередь callbacks из HoleService.** До этого её текущая реализация лучше, чем разнесённые неупорядоченные component updates.
4. **После появления Three instancing facade упростить HoleCollectiblesComponent.** Game-side останутся группировка/идентичность игровых entities и получение поз из симуляции.
5. **Сосредоточить authored tuning в JSON там, где сейчас остались реальные настройки.** В частности, в `HoleSimulation` и UI/FX встречаются damping, tolerances, durations, масштабы и pool counts. Отделить намеренные технические constants/epsilon от параметров художественной настройки; не переносить каждую цифру в JSON механически.
6. **Синхронизировать документацию с текущей кампанией.** Сейчас это самостоятельная задача сопровождения, не повод менять gameplay.

`HoleService` пока не требует большого дробления: 169 строк и достаточно связная роль application facade. Появление десятков menu/economy/ad use cases будет основанием выделить их, но переносить каждый getter в отдельный service сейчас не стоит.

### Что не нужно рефакторить только ради формальной чистоты

- Пустые scene subclasses и короткие command classes.
- Прямое использование Three/Pixi в специализированных visual components.
- Scene-scoped state и синхронные domain queries.
- Специальные shader/material решения текущей игры.
- Декодирование неизвестного JSON перед входом в domain плюс отдельная проверка domain-инвариантов: это разные обязанности.
- Отдельный Cannon adapter вместо попытки использовать Matter для 3D.
- Текущий event journal только потому, что он существует. Для ограниченной попытки это допустимая простая модель.

## 6. Что стоит добавить в SDK на основании этой игры

Предложения ниже привязаны к существующим call sites. Имена API ориентировочные: это не утверждённая спецификация.

| Возможность | Где уже нужна | Минимальная полезная граница | Приоритет |
| --- | --- | --- | --- |
| Ownership подписок и ресурсов | Почти все visual/input/UI components ведут `off[]` и свой cleanup | `DisposalScope` / `ownDisposer`, отдельно detach lifetime и enabled lifetime, обратный порядок, aggregate errors | Высокий |
| Post-physics/presentation подписка | `HoleService.onPresentation`, camera `-100`, HUD `100` | Scope-owned hook scheduler с определёнными стадиями | Высокий |
| Runtime diagnostics hooks | `CampaignProfiler` подменяет методы; `IslandFpsComponent` считает cadence | Frame/phase CPU timings, raw delta и simulation delta, bounded samples, подписка/disposer | Высокий |
| Three instanced model batches | `HoleCollectiblesComponent` вручную извлекает primitives и держит leases | Backend-specific batch owner: capacity, transform/visibility update, dispose; без игровых entity rules | Высокий |
| Строгая загрузка списка assets | Scene preload моделей через `assets.ids` | `loadRequired(ids)` с сохранением причин по ID и отменой | Высокий |
| Scene/group lifetime assets | Десять уровней с разными models | Явные retain/release scopes и безопасное освобождение неиспользуемого | Высокий для масштабирования кампании |
| World→screen→UI projection | HUD берет native camera и вручную переводит NDC в CSS/UI | Three projection service с camera scope, viewport и результатом visibility; Pixi local conversion отдельным adapter | Средний |
| Keyboard/action input и virtual stick | `HoleInputComponent` обрабатывает window keys, blur, orientation, pointer ownership | Независимые normalized intent sources; без знания `HOLE_MOVE`, WASD по умолчанию и session states | Средний |
| Engine-owned persistence policy | `HoleProgressService` вручную выбирает adapter; coordinator глобален | Инъецируемый storage service с явным backend policy, наблюдаемыми ошибками и migration hook | Высокий по корректности |
| Three material/resource helpers | Ground/player/water вручную клонируют, восстанавливают и освобождают ресурсы | Небольшой owner для instance-local override и GPU resources; shared assets не уничтожаются | Средний |
| Reusable UI behavior | `IslandButtonComponent`, modal focus/backdrop, feedback pools | Button/modal interaction отдельно от конкретного art/prefab; node-owned scale feedback и enable/visibility semantics | Средний |
| Optional Cannon package как часть SDK ecosystem | Уже существующий `physics-cannon` | Самостоятельная собранная поставка, narrow body/world types и отдельный `/sdk` adapter | Средний; большая часть кода уже есть |

### 6.1. Сначала владение ресурсами, потом новые эффекты

Наиболее универсальная недостающая возможность — не эффект или компонент, а компактное владение cleanup. В игре повторяются `private off`, `off[]`, ручные window listeners, GPU disposal и subscriptions. `BaseComponent` уже умеет `ownTween`; логичное продолжение — такой же простой путь для остальных ресурсов.

Нужно различать:

- ресурс живёт до detach;
- подписка активна только при enabled;
- async результат опоздал после отмены и должен быть немедленно освобождён.

Объединять эти случаи в неочевидный `autoCleanup` не стоит. Лучше несколько маленьких, явно названных операций с одной ownership-моделью.

### 6.2. Instancing — в Three adapter, а не в общий domain

Предлагаемая batch facade должна знать `ModelAsset`, локальные transforms primitives и буферы Three. Она не должна знать `HoleEntity`, collected state, growth и Cannon.

Пример ответственности consumer: «для instance 17 применить эту pose; instance 23 скрыть». Ответственность SDK: сохранить local model transform, обновить GPU buffers, не уничтожить shared geometry/material, освободить lease и instance resources.

Не стоит сразу добавлять скелетную анимацию, morph targets и универсальную material mutation систему. Текущий GLB loader явно ограничен статическими self-contained моделями; это допустимый MVP-контракт.

### 6.3. Физика: переиспользовать lifecycle и pose, сохранить различия движков

`CannonWorld` уже отделён от renderer и DOM и предоставляет fixed-step hooks. Это хорошая база отдельного пакета. Общее с SDK можно сделать вокруг clock, pause, lifetime, statistics и typed poses.

Интерполяция position/quaternion сейчас находится в `HoleSimulation.actorPose`. Она частично generic и может перейти в physics utility/component. Но преобразование body COM в конкретный model origin и правило полного исчезновения предмета из отверстия должны оставаться на правильной feature boundary.

`CannonApertureGround` — специализированная модель опоры с отверстием. Сам факт нахождения в отдельном пакете не делает её универсальной обязанностью core SDK: разумно оставить её game extension или явно опциональным модулем.

### 6.4. Более низкий приоритет

- Типизированная карта событий поверх существующего EventBus может ловить ошибки имён/payload в TypeScript, но не заменяет runtime decoding внешних данных.
- Reusable bounded pool для UI feedback оправдан текущими flyouts, но должен оставаться маленьким owner, без глобального effect manager.
- Event cursor с чтением по sequence может сократить повторные `events.filter`. Сейчас журнал растёт в пределах попытки и очищается при restart, поэтому это не доказанная утечка памяти. Оптимизировать по профилю больших уровней.
- Раздельная resolution policy Three world и Pixi UI может дать пользу в hybrid на мобильных устройствах. Добавлять её стоит после измерения: текущие два canvas закономерно означают два GPU render targets, но сам по себе hybrid не является ошибкой.
- Schema refinements/discriminated unions пригодятся для collider config. Сначала проверить, насколько они реально сокращают существующие ручные ветвления; не писать собственную большую validation framework.

## 7. Что уже есть в hybrid.1 и не требует повторной реализации

Сравнение с 0.0.12 важно только для миграции. В основной проверяемой версии уже реализованы:

- Выбор Pixi, Three или hybrid renderer module.
- Отдельные public renderer entrypoints и JS/declaration outputs.
- Нейтральный `NodeBase`, checked `requireNode` и typed component binding.
- `Engine.run()` с возвращаемым handle и идемпотентный `Engine.destroy()`.
- Выход сцен при destroy; восстановление bindings/camera после `pop`.
- Удаление старой сцены из stack перед неудачным новым preload/enter.
- Layout construction rollback и scene enter rollback в общем виде.
- Рекурсивный logical tree update вместо обхода ID index как дерева обновления.
- Prefab strict spawn, single-flight ensure, проверка истёкшего scope и disposed parent.
- `NineSliceSprite`, включая проверку borders и source-space sizing.
- Статический GLB loader, `ModelAsset` leases и запрет asset dispose с живыми экземплярами.
- Renderer warmup после component readiness и до старта FSM.
- UI-first hybrid hit testing и прозрачный Pixi overlay.
- SDK audio autoplay recovery, single-instance music и JSON volumes.
- Runtime activity/pause reasons.

Например, рекомендации «добавить destroy», «починить pop bindings», «добавить NineSliceSprite» относились бы к старой основе, но были бы неверным backlog для hybrid.1.

## 8. Что оставить в игре

В SDK не стоит переносить:

- квоты фруктов, surplus XP, рост отверстия, цели и звёзды;
- правила бустеров `time-freeze`, `bigger-hole`, `magnet`, `goal-finder`;
- выбор маршрута к нужному фрукту и topology конкретных уровней;
- условие capture по полному visual envelope и rescue-поведение;
- структуру кампании, первый выигрыш, монеты и награды;
- конкретные Fruit Lagoon shaders, shore cutout и художественный профиль воды;
- layout конкретного HUD, тексты, размеры карточек и иконки;
- авторинговые pipelines Blender/texture/collider для этих уровней.

SDK может дать bounded pool, projection, asset owner, physics body facade и UI interaction primitive. Как именно из них построена эта игра — ответственность consumer.

## 9. Поставка пакетов и перенос в master

### Положительная часть

В hybrid.1 package exports указывают на отдельные JS и declarations для subsystems/renderers. Esbuild использует multi-entry и splitting, Pixi/Three объявлены optional peers. Это существенно лучше старой поставки, где каждый subsystem entrypoint разрешался в один общий bundle/declaration файл.

Root entrypoint hybrid больше не переэкспортирует весь renderer-specific runtime. Нельзя по одной физической папке или наличию зависимости в devDependencies заключать, что Three-only consumer обязательно загрузит Pixi.

### Что проверить при интеграции

1. Зафиксировать единый source snapshot hybrid.1 и переносить его вместе с package metadata/build scripts/types.
2. Сохранить обязательный renderer selection как осознанное изменение API и дать миграционный пример для Pixi consumers.
3. Проверить пакованный consumer в режимах Pixi-only, Three-only и hybrid, включая отсутствие невыбранного optional peer.
4. Передать в SDK тесты hybrid, NineSlice и warmup из game-local package, а также renderer/package checks из `sdk-three`.
5. Согласовать empty template: renderer-specific factories должны регистрироваться module, а не дублироваться глобальным game DI.
6. Проверить, что tooling использует совместимую engine version и сохраняет platform build defines.
7. Подготовить нормальную поставку Cannon, если его планируется использовать вне этой игры: сейчас package экспортирует TypeScript source и помечен private.
8. Проверить реальные потребительские изменения в доступных Pixi-играх; этот аудит не выполнял их миграцию.
9. Обновить README/CHANGELOG и обозначить ограничения GLB/hybrid, ownership и публичные guarantees.
10. Выравнять PR-validation и release-validation: существенные runtime проверки должны срабатывать до merge, а не только перед публикацией.

В текущем основном SDK CI и publish workflow запускают разные наборы проверок: audio/locales/CrazyGames присутствуют в release workflow, но отсутствуют в обычном validate workflow. Это стоит исправлять вместе с интеграцией hybrid, а не переносить автоматически старую матрицу.

## 10. Предлагаемый порядок работ

### Этап 1 — закрыть корректность базовых контрактов

- A1: rollback частично вошедших services.
- A2: cleanup всех компонентов/actions независимо от ошибок.
- A3: единый наблюдаемый путь ошибок async events/detached work.
- A4–A5: отмена/истечение scene scope и согласованный Engine lifecycle.
- A6: детерминированная политика override DI.
- A7: выбрать семантику persistence для реального платформенного запуска игры.

Результат этапа — небольшой набор адресных изменений и regression tests. Это не требует переработки domain или visual art игры.

### Этап 2 — довести hybrid до общей поставки

- Согласовать package exports, declarations, optional peers, tooling и template.
- Перенести существующие renderer tests и добавить независимые packed-consumer smoke checks.
- Обновить документацию и проверить миграцию Pixi consumers.
- После перехода на общий пакет прекратить параллельное развитие локальной копии SDK в игре.

### Этап 3 — убрать повторяющуюся инфраструктуру из игры

В таком порядке: disposal scopes → presentation hooks → diagnostics → instancing → projection/input primitives. Каждый перенос выполнять вместе с переходом конкретного consumer call site на новый API и удалением старого обходного кода.

### Этап 4 — оптимизация по измерениям

Asset residency/VRAM, физика крупных уровней, event journal, render budgets двух canvas. Число classes, строк или entities само по себе не является метрикой производительности. CPU simulation tests не дают device FPS.

## 11. Какие regression tests действительно нужны

Здесь полезны проверки наблюдаемого контракта, а не тесты, повторяющие структуру реализации:

| Контракт | Сценарий |
| --- | --- |
| Partial service enter | A вошёл, B упал; все приобретённые ресурсы освобождены в корректном обратном порядке |
| Ошибка cleanup | Первый disable/detach бросает; остальные владельцы всё равно освобождены; ошибки возвращены агрегированно |
| Async event safety | Async handler rejected; emit остаётся синхронным, нет unhandled rejection, diagnostics получает context |
| Timeout scope | Enter опоздал после timeout; новый scene scope не изменён, late resource освобождён |
| Engine operation races | Двойной init/start, destroy во время init/start; нет повторного mount/listeners/loop и позднего восстановления disposed runtime |
| DI override | Resolve до override не меняет заявленную семантику; либо понятный запрет, либо корректная замена с ownership |
| Storage identity | Platform backend доступен, key отсутствует, local key существует; поведение соответствует выбранной policy |
| Required assets | Ошибка отдельного ID прерывает preload с исходным cause, а optional loading остаётся optional |
| Asset scope | A и B разделяют model; выход A не разрушает B; после release обоих допустимо освобождение |
| Presentation order | Physics → interpolation → camera → world → HUD в одном кадре, без лишнего update и stale callback |
| Package boundary | Three-only consumer без Pixi и Pixi-only без Three собираются из упакованного SDK |

Уже существующие зелёные 124 теста полезны и должны быть сохранены. Они не доказывают гарантии из этой таблицы автоматически: именно поэтому несколько воспроизводимых lifecycle-дефектов остались незамеченными.

## 12. Итоговое решение

**Я бы оставил архитектурное направление hybrid.1 и переносил его в master после адресного укрепления lifecycle/error contracts.** Здесь уже есть правильные boundary abstractions и практические признаки хорошей архитектуры: чистые игровые правила, тонкие команды, node-owned visuals, отдельная физика, явные схемы и resource leases.

Наибольшая отдача сейчас будет от гарантий «кто владеет ресурсом, что происходит при ошибке и когда исполняется presentation». Дополнительные абстрактные слои, универсальный ECS, большой gameplay framework или массовое дробление классов дадут меньшую пользу и усложнят SDK.

На основании `three-game` функционально развивать SDK стоит прежде всего в сторону **lifecycle scopes, presentation ordering, Three instancing, projection/input ergonomics и diagnostics**. Правила Hole, экономика и художественная специфика должны остаться в игре.
