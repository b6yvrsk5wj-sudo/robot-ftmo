# 🤖 GUIDE COMPLET — Robot FTMO (tout mon setup)

> Ce document résume TOUT mon robot de trading, pour que je (ou une nouvelle conversation Claude) puisse repartir de là sans rien perdre.

---

## 1. La stratégie

**Trend-Pullback (suivi de tendance + repli), timeframe 1h, sur indices US + Or.**
- On suit la tendance (EMA50 > EMA200), on attend un repli sur l'EMA21, puis une bougie de confirmation.
- Stop Loss = 3 × ATR. Take Profit = 3R (3× le risque). Pas de break-even.
- Win rate ~31% (on perd 2 trades sur 3, c'est NORMAL — les gains à +3R compensent).
- **Validée sur 21 ans de données** (backtest, walk-forward) : Profit Factor ~1,45.

## 2. Les instruments
S&P 500 (US500), Nasdaq (US100), Dow (US30), Or (XAUUSD).
Données via Yahoo Finance (pas TradingView). ⚠️ Léger décalage possible avec le broker.

## 3. Les règles de risque
- **1% de risque par trade.**
- **Cap 3** : max 3 positions ouvertes en même temps.
- **Max 3 nouveaux trades par jour.**
- Anti-doublon : 1 seule alerte par signal.

## 4. Comment le robot tourne (technique)
- **Hébergé sur GitHub Actions** (dépôt `b6yvrsk5wj-sudo/robot-ftmo`), fichier `robot_ftmo.mjs`.
- **Déclenché toutes les 15 min par cron-job.org** (fiable, PC éteint). Un token GitHub "classic" dans cron-job.org appelle l'API `workflow_dispatch`.
- Secrets GitHub : `TELEGRAM_TOKEN`, `TELEGRAM_CHAT` (chat id `1661502186`).
- État sauvegardé dans `state.json`, journal dans `ftmo_signals_log.json`.

## 5. Les alertes Telegram (bot "Joybot")
- **Signal** : sens, entrée, SL, TP, + **le nombre de LOTS exact à mettre**.
- **Clôture** : ✅ +3R ou ❌ −1R.
- **Heartbeat** : chaque jour à 20h (Paris) → "🤖 Robot OK".
- **Alerte panne** si Yahoo tombe.

## 6. Les commandes Telegram (écrire au bot)
- `close or tp` → clôture l'or en gain (+3R) et libère la place
- `close us30 sl` → clôture en perte
- `close nasdaq` → clôture sans préciser le résultat
- `status` → positions ouvertes
- `aide` → rappel

## 7. Le SIZING (calcul des lots) — IMPORTANT
Le robot calcule : `Lots = (1% du compte) ÷ (distance SL en points × Contract Size)`.
- **Contract sizes de mon broker** (lues sur MT5) : `XAUUSD=100, US30=1, US100=1, US500=1`.
- **Taille de compte** : 100 000$ (démo pour l'instant).
- ⚠️ **L'US500 affiche ~16 lots — c'est NORMAL et correct** (contrat "petit" à $1/point). Ne pas juger un lot au "gros ou petit chiffre" — faire confiance au robot.
- Ces valeurs sont dans le fichier `robot_ftmo.mjs`, tout en haut (bloc RÉGLAGES : `ACCOUNT_SIZE` et `CONTRACT`).

## 8. Pour modifier le robot
Tout est réglable en haut de `robot_ftmo.mjs` :
```
RISK_PCT = 1.0          // % de risque
MAX_CONCURRENT = 3      // positions simultanées
MAX_PER_DAY = 3         // nouveaux trades/jour
ACCOUNT_SIZE = 100000   // taille du compte
HEARTBEAT_HOUR_UTC = 18 // 20h Paris
CONTRACT = { XAUUSD:100, US30:1, US100:1, US500:1 }
```

## 9. Où j'en suis / prochaines étapes
- **Phase : FORWARD-TEST** (démo, pas d'argent réel). Objectif : observer plusieurs semaines que l'edge tient en live.
- **AVANT d'acheter FTMO** : idéalement finir le forward-test. Si j'achète : commencer PETIT (10-25k), garder 1% par trade.
- **Leçon apprise** : le sizing est LE tueur n°1. Une erreur de lot m'a coûté ~4% en démo (heureusement pas en réel).
- Idées testées et écartées (ne pas y revenir, données à l'appui) : scalping, intraday, Fibonacci, haut win rate, élargir le panier — tout ça était moins bon que la stratégie actuelle.

## 10. À retenir psychologiquement
- 2 trades sur 3 perdent → NORMAL. Ne pas paniquer sur une série de pertes.
- Ne pas intervenir sur les trades (laisser le SL/TP faire).
- Patience : ~2-3 trades/semaine, en rafales.
- Faire confiance au système, ne pas chercher la "stratégie magique" (elle n'existe pas).
