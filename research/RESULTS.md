# 📊 Recherche juillet 2026 — Stratégie #2, filtres, et risque FTMO

> Backtests réalisés le 2026-07-02. Données Yahoo Finance : 25 ans daily (2001-2026) + 2 ans 1h (config live).
> Coûts inclus (spread+slippage aller-retour) : US500 0.8 pt, US100 2.5 pts, US30 4 pts, XAUUSD 0.5 pt.
> Moteur : `research/lib.mjs` + `bt_trend.mjs` + `bt_meanrev.mjs` + `combine.mjs`. Gaps gérés, SL prioritaire sur TP (conservateur).

## 1. Nouvelle stratégie validée : MEAN-REVERSION "MR-A" ✅

**Règles** : sur bougies DAILY, indices seulement (US500, US100, US30), LONG uniquement.
- Entrée : clôture > SMA200 **et** RSI(2) < 10 → achat à la clôture.
- Stop catastrophe : 3 × ATR(14) sous l'entrée (définit le R).
- Sortie : clôture > SMA5 **ou** RSI(2) > 65 **ou** 10 jours écoulés → sortie à la clôture.

**Résultats 25 ans (indices, long only)** : 597 trades, **73.5% win rate, PF 1.82**, +66.8R, maxDD 7.9R seulement.
Profitable sur les 4 sous-périodes (PF 1.26 à 2.12). Sur les 2 dernières années : PF 3.95, DD 1.4R.

**Rejetés avec données** : le côté short (PF 0.97 → perdant), l'or en mean-reversion (PF 1.14 → trop faible),
la variante Bollinger (Nasdaq négatif), la variante "3 clôtures baissières" (période 2015-2020 négative).

**Décorrélation confirmée** : corrélation mensuelle avec le trend-pullback = **+0.22 sur 25 ans, −0.16 sur 2 ans**
vs la config live 1h. C'est le complément idéal : MR-A gagne dans les marchés qui font souffrir le trend.

**Portefeuille combiné 25 ans** (trend TP3R + MR-A) : +175.6R vs +108.7R trend seul, maxDD quasi identique
(19.4R vs 17.6R) → ~+60% de rendement pour le même risque. Années négatives : 7/25, aucune pire que −11R.

## 2. Filtres/sorties du trend-pullback : la baseline gagne (presque)

Testés sur 25 ans daily ET 2 ans 1h : TP 2R, TP 4R, break-even +1.5R, trailing chandelier 3ATR, filtre volatilité, filtre session US.

| Variante | Verdict |
|---|---|
| **TP 4R** | ✅ Seule vraie amélioration : daily 25a PF 1.89 vs 1.58, +146.7R vs +108.7R. Sur 1h : neutre-positif (PF 1.25 vs 1.24). Win rate baisse à ~25-33%. |
| TP 2R | ❌ Pire partout |
| Break-even +1.5R | ➖ PF légèrement mieux, espérance moins bonne |
| Trailing chandelier | ❌ Sur 1h : PF 1.12, DD double. Non. |
| Filtre volatilité | ➖ Aucun effet mesurable |
| Filtre session US | ➖ Aucun effet mesurable |

Conclusion : les sorties actuelles (SL 3ATR / TP 3R) sont déjà proches de l'optimum. Le TP 4R est le seul
candidat sérieux — preuve forte sur 25 ans daily, faible sur 2 ans 1h. À considérer, pas urgent.

## 3. ⚠️ RISQUE PAR TRADE : la vérification dit NON à 1.25-1.5%

C'est la découverte la plus importante. Le DD max historique de la config live (1h, 2 ans) est **12.9R**.
- À 1%/trade → DD −12.9% → **aurait déjà cassé la limite FTMO de 10% une fois dans les 2 dernières années.**
- À 1.5%/trade → DD −19% → compte cramé, et pire journée −6.8% → casse aussi la limite journalière de 5%.

| Risque/trade | DD historique | DD prudent (×1.5) | Verdict FTMO (10% max) |
|---|---|---|---|
| 1.5% | −19% | −29% | ☠️ Non |
| 1.0% | −12.9% | −19% | ❌ Trop juste (déjà cassé en histo) |
| 0.7% | −9% | −13.5% | ⚠️ Limite |
| 0.5% | −6.5% | −9.7% | ✅ OK avec marge |

**Recommandation** : garder 1% en DÉMO (aucune règle à casser, on mesure l'edge). Pour le vrai challenge
FTMO : **0.5-0.7%/trade**, PAS 1.25-1.5%. La bonne nouvelle : avec MR-A ajoutée (~+7R/an sur 2 ans),
le combiné à 0.6% vise ~+16%/an avec un DD prudent sous les 10% — c'est ça, la config "challenge".

## Estimation live combinée (2 dernières années, 1h trend + MR-A daily)

- Trend 1h : +40.8R / 2 ans (~20R/an) — PF 1.24 (plus faible que le daily 25a : période courte, à surveiller en forward)
- MR-A : +14R / 2 ans (~7R/an) — PF 3.95
- Combiné : ~27R/an, corrélation −0.16, DD combiné 12R sur 2 ans

## 4. Simulation portefeuille avec les RÈGLES EXACTES du robot (question utilisateur, 2026-07-02)

> Question légitime : les backtests ci-dessus prennent TOUS les trades par instrument, mais le robot live applique
> cap 3 positions trend, max 3 nouveaux/jour, sélection par score, et anti-conflit trend/MR. Impact mesuré (`bt_portfolio.mjs`) :

| Config | Sans limites | Avec règles robot | Verdict |
|---|---|---|---|
| Trend 1h, 2 ans (live) | +40.8R, PF 1.24, DD 12.9R | +39.6R, PF 1.28, DD 12.7R | ✅ coût ~nul, qualité même un peu meilleure |
| Trend daily, 25 ans | +108.7R, PF 1.58 | +85.7R, PF 1.54 | −21% de R, edge intact |
| **COMBINÉ LIVE 2 ans (1h+MR+anti-conflit)** | +55.0R, PF 1.32, DD 12.0R | **+50.8R, PF 1.35, DD 11.1R** | ✅ −8% de R, PF et DD MEILLEURS |

- L'anti-conflit ne coûte presque rien en live (MR : 52 trades au lieu de 66 sur 2 ans) car les positions trend 1h durent 1-3 jours.
  ⚠️ Si un jour le trend passait en daily (positions de plusieurs semaines), l'anti-conflit deviendrait très coûteux (MR 208 vs 621 sur 25 ans).
- ⚠️ Pic observé : **6 positions simultanées** (3 trend + 3 MR) — à intégrer dans le sizing du challenge réel
  (6 × 0.7% = 4.2% de pire journée théorique, sous la limite des 5% mais sans grosse marge).
- Pourquoi les caps coûtent si peu : 4 instruments saturent rarement le cap 3, la sélection par score garde les
  meilleurs signaux, et un signal sauté se re-déclenche souvent à la bougie suivante si les conditions persistent.

## 5. Monte Carlo du challenge FTMO (2026-07-07) — combien de temps, quelles chances ?

> 20 000 simulations par config (`mc_challenge.mjs`) : bootstrap circulaire de la séquence réelle des trades
> (config live, règles robot). Règles FTMO : cible +10% (P1) / +5% (P2), perte max −10% statique, −5%/jour, sans limite de temps.
> Approximation trades clôturés (flottant non modélisé → légèrement optimiste).

| Risque/trade | P1 : réussite | P1 : durée médiane (90e pct) | P2 : réussite | P2 : médiane |
|---|---|---|---|---|
| 0.5% | 100% | 7.3 mois (15.7) | 100% | 3.0 mois |
| 0.7% | 100% | 6.1 mois (13.5) | 100% | 2.3 mois |
| **1.0%** | **96%** | **2.9 mois (10.2)** | **96%** | **1.1 mois** |
| 1.25% | 88% | 2.2 mois | 88% | 0.8 mois |
| 1.5% | 77% | 1.4 mois | 82% | 0.7 mois |

**Stratégie retenue (asymétrie coût/bénéfice)** : pendant le CHALLENGE, risquer 1%/trade — 96% de réussite par
phase (~92% les deux), durée totale médiane ~4 mois, et l'échec ne coûte que les frais (~500€), pas le compte.
Une fois FINANCÉ, redescendre à 0.5-0.7% — là, cramer coûte le compte, et à 1% le DD historique (12.9R) le tuerait.
Attente réaliste totale : forward-test (encore ~5 semaines) + P1+P2 (~4-6 mois) → compte financé début-mi 2027.

## Prochaines étapes possibles
1. ~~Déployer MR-A dans le robot~~ ✅ FAIT le 2026-07-02 (commit 695e47f).
2. TP 4R sur le trend : écarté (aucun gain sur la config live 1h).
3. Challenge réel : risque 1%/trade pendant les phases, puis 0.5-0.7% sur le compte financé (voir section 5).
