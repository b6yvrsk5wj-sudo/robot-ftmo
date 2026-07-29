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

**Parcours complet jusqu'au financement (rachats de challenge inclus, `mc_pipeline.mjs`)** :

| Risque challenge | Médiane | 90e pct | Financé ≤6 mois | Frais moyens |
|---|---|---|---|---|
| 1.0% | 6.9 mois | 14.6 | 42% | 619€ |
| 1.25% | 4.6 mois | 13.0 | 59% | 853€ |
| 1.5% | 3.9 mois | 10.6 | 68% | 994€ |

**Survie du compte FINANCÉ sur 12 mois, AVEC retraits mensuels** (le coussin repart à ~0 à chaque payout —
c'est ça le scénario réaliste, et ça change tout) :

| Risque financé | Compte perdu dans l'année | Encaissé/an si survie (part trader 80%) |
|---|---|---|
| 0.5% | 0% | ~11 400 $ (sur 100k) |
| **0.7%** | **0%** | **~16 100 $** |
| 1.0% | **34%** ☠️ | ~26 100 $ |
| 1.25% | 69% ☠️ | — |

**PLAN FINAL (décision utilisateur 2026-07-07)** : challenge à **1.5% en "MODE CHALLENGE"** puis compte financé à
**0.7% MAXIMUM — promesse actée** (à 1%, avec les retraits, on perd le compte 1 année sur 3).

**MODE CHALLENGE (`mc_challenge_mode.mjs`)** : à 1.5%, le tueur est la règle des −5%/jour (pire jour historique
−4.5R × 1.5% = −6.75% = mort). Parade : **cap TOTAL de 3 positions (trend+MR confondus)** pendant le challenge →
pire jour théorique −3R × 1.5% = −4.5%, structurellement sous la limite. Résultat simulé (à 1.5%, rachats inclus) :

| Config 1.5% | Médiane | 90e pct | Financé ≤6 mois | Frais moyens |
|---|---|---|---|---|
| Règles normales (jusqu'à 6 pos.) | 3.9 mois | 10.8 | 68% | 1001€ |
| **MODE CHALLENGE (cap total 3)** | **3.4 mois** | **8.9** | **76%** | **921€** |

(Le cap total 3 n'aide PAS à ≤1.25% — utile uniquement à 1.5%.)
**CHECKLIST DU JOUR GO** (après forward-test, ~fin août) :
0. **ACHETER LE COMPTE "FTMO SWING"** (pas le normal !) — le compte FTMO standard interdit de garder des positions
   le week-end ; nos trades durent des semaines. Sans Swing, le plan meurt le premier vendredi soir. Même tarif.
1. Comparer le relevé MT5 démo aux logs du robot (résultats réels vs théoriques : spreads, slippage, exécution, SWAPS) —
   c'est LE critère de validation final avant de payer le challenge.
2. Passer `RISK_PCT=1.5` + implémenter `TOTAL_CAP=3` partagé trend/MR dans le robot.
3. Ajouter un watchdog "dead-man switch" (ping healthchecks.io à chaque run → alerte si le robot cesse de tourner,
   car un heartbeat ABSENT ne se remarque pas). ~5 lignes, à faire dans le même commit que le mode challenge.
4. Mettre `ACCOUNT_SIZE` à la taille réelle du compte challenge acheté.
Une fois financé : `RISK_PCT=0.7`, retirer le cap total (retour aux règles normales).
Attente réaliste : forward-test (~5 semaines) + challenge (~3.4 mois médiane) → financé fin 2026-début 2027.

## 6. SWAPS (frais overnight) — question utilisateur du 2026-07-20, angle mort corrigé

> Les backtests incluaient le spread mais PAS le financement quotidien. FTMO facture les swaps (triple le mercredi) ;
> le swap-free n'existe que pour les comptes islamiques. Impact estimé (`bt_swap.mjs`, taux centraux −0.015%/j indices
> long, −0.02%/j or long, ~0 short — **à confirmer avec la fenêtre Spécification MT5 de l'utilisateur**) :

| Config live 2 ans | Sans swap | Avec swap central |
|---|---|---|
| Trend 1h | +37.8R, PF 1.26 | **+22.7R, PF 1.15** (−40%) |
| MR-A daily | +13.1R | +12.2R (quasi immune : stop daily large → notionnel/risque ~15 vs ~60-90 pour le trend 1h) |
| Combiné | +50.8R (~2.1R/mois) | **+34.8R (~1.45R/mois)** |

- Marathons (>21j) : swap moyen −0.34R mais résultat net moyen **+1.18R** → on ne coupe PAS les trades longs, ils restent les meilleurs.

**TAUX RÉELS relevés par l'utilisateur (MT5, 2026-07-20)** — en points/jour : US100 L −620.96/S +25.84,
US30 L −1133.52/S +47.17, US500 L −157.71/S +2.44, XAUUSD L −73.08/S −23.55. Interprétation validée par
cohérence croisée : ≈ **−0.021%/jour du notionnel en long indices** (≈7.7%/an de financement, cohérent avec les taux 2026),
short indices légèrement POSITIF (~+0.001%/j), or négatif des deux côtés. (Caveat : taux du broker démo ; FTMO peut différer un peu.)

**Résultats aux taux réels** : trend 1h +37.8R → **+18.0R (PF 1.12)** — le swap mange ~la moitié de l'edge 1h ;
MR-A quasi intacte (+11.8R, PF 3.92) ; combiné +29.8R (~**1.25R/mois net**). L'edge net se répartit désormais ~60/40
entre trend et MR — MR-A devient un pilier, plus un complément.
- Challenge recalibré aux taux réels (mode 1.5%, `mc_swap.mjs`) : **médiane 4.4 mois**, financé ≤6 mois **62%**, frais moyens ~**1440€**.
- ⚠️ L'edge NET du trend 1h aux taux réels est mince (PF 1.12 sur 2 ans) — c'est LE point que le forward-test doit confirmer.
  Le démo paie les vrais swaps → le solde MT5 de l'utilisateur reflète déjà la réalité nette.

## 7. REGISTRE DES RISQUES (audit "détails qui tuent", 2026-07-20)

### ✅ Vérifiés et réglés
- **Compte Swing obligatoire** (week-end + news sans restriction) — item 0 du GO. Léger surcoût possible selon la gamme.
- **Swaps** quantifiés (section 6), à affiner avec les specs MT5 de l'utilisateur.
- **MT5 disponible en Europe** chez FTMO (la restriction MetaTrader ne concerne que les clients US).
- **Robots/EA autorisés** si stratégie propre (la nôtre est unique) et non hyperactive (~10 trades/mois : très loin des seuils).
- **Pas de limite de temps** sur les phases ; minimum 4 jours de trading : trivial. **Pas de consistency rule** chez FTMO.

### ⚠️ Risques actifs (avec mitigation)
1. **Gaps de week-end au-delà du SL** : un lundi peut ouvrir SOUS le stop → perte >1R/position ; 3 positions corrélées + gros gap
   peut menacer la règle des −5%/jour. Partiellement inclus dans les backtests (les gaps historiques y sont). Résiduel accepté ;
   le cap total 3 en mode challenge est la principale protection.
2. **La limite journalière FTMO compte le FLOTTANT** (équité vs minuit CET) — nos simulations comptent le clôturé → légèrement
   optimistes. Au stade VPS : kill-switch sur équité temps réel.
3. **Yahoo = API non officielle**, peut casser sans préavis (précédent en 2023). Le robot alerte déjà en cas de panne ;
   plan B le jour J : basculer sur Stooq/TwelveData (~1h de code).
4. **Réglementation UE des prop firms en durcissement** (ESMA/MiFID II 2024-2026) : pas d'interdiction, modèle susceptible
   d'évoluer. Risque lent — point de veille trimestriel, ne bloque pas le plan.
5. **Impôts France** : les payouts FTMO sont des revenus à déclarer (BNC/prestation) — le "~16k$/an part trader" est un montant
   AVANT impôts (~30-45% selon statut). À intégrer avant le premier payout.
6. **Absences/vacances** : une alerte non exécutée = trade raté (acceptable statistiquement, à me signaler pour le tracking).
   Prévenir à l'avance pour les vacances d'août.
7. **Divergence réel/théorique NON mesurée** : captures MT5 (historique + spécifications swap) toujours en attente — devient
   BLOQUANT au jour GO.

### Mineurs notés
Dépôt public (stratégie visible, token en secret : OK) ; expiration possible des démos MT5 inactives ; le cron GitHub de secours
peut se désactiver après 60 j sans activité (non pertinent : cron-job.org principal + commits fréquents).

## 8. RECHERCHE ANTI-SWAP (2026-07-29) — que faire du problème des frais

> Après le constat de la section 6 (les swaps mangent la moitié de l'edge), recherche systématique.
> Scripts : `fix_swap.mjs` (élargir les stops, changer de TF), `fix_swap2.mjs` (spécialiser par instrument/sens).
> ⚠️ Ces chiffres incluent le **triple swap du mercredi** (facteur 1.28) — plus sévères que la section 6.

### Pistes ÉCARTÉES (testées, ne marchent pas)
- **Élargir les stops** (4x/6x/8x ATR au lieu de 3x) : le ratio notionnel/risque baisse, mais la durée des trades
  augmente et annule le gain. Net/an : 4.5R (3x) → 5.8R (4x) → −2.1R (6x) → 0.5R (8x). Rien d'exploitable.
- **Passer le trend en daily** : pire (stops larges mais trades beaucoup plus longs). 25 ans : +0.2R/an net, maxDD 48.7R.
- **Couper les trades longs** : déjà écarté (section 6), les marathons restent nets positifs en moyenne.

### La vraie structure du coût (par trade, trend 1h, net de swap)
| Instrument | Swap/trade | Net/an (2 ans) |
|---|---|---|
| **XAUUSD** | **0.063R** | **+5.0R** ✅ |
| US100 | 0.158R | +1.3R |
| US500 | 0.214R | −3.5R ❌ |
| US30 | 0.251R | +1.9R |

**L'or coûte 3-4x moins cher** (taux broker plus bas + ATR proportionnellement plus grand). **Les SHORTS indices ont un
swap ~nul voire positif** (+0.0009%/j). Les LONGS indices sont ce qui saigne.

### Meilleure recombinaison trouvée : **or (2 sens) + shorts indices + MR-A**
| Config | 2 ans net/an | 25 ans net/an | swap/an (2 ans) |
|---|---|---|---|
| ACTUEL (trend tous + MR) | 9.9R | 0.2R | **−16.9R** |
| **or + shorts indices + MR** | **11.8R** | 1.5R | **−4.5R** |
| or seul + MR | 10.3R | 2.2R | −4.5R |
| MR seule | 5.3R (PF 2.98, maxDD 1.5R) | 1.7R (PF 1.46, maxDD 9.5R) | −1.1R |

→ **La facture de swap baisse de 73% et le rendement net MONTE.** Domine la config actuelle sur les deux fenêtres.

### Piste "cull des zombies" — ÉCARTÉE après autopsie (`fix_swap3.mjs`)
Idée : fermer les trades encore plats après N jours (≠ couper les gagnants). Sur 2 ans ça semblait excellent
(net/an 4.5R → 10-12.8R). **Mais l'autopsie tue l'idée** :
1. **Le swap ne baisse quasiment pas** : −15.9R/an → −14.9R/an (−7% seulement). Les trades culés étaient déjà courts ;
   ce ne sont pas eux qui coûtent. Donc le "gain" ne vient PAS d'une économie de frais.
2. **Le brut MONTE** (20.4 → 26.1R/an) et le nombre de trades explose (231 → 275-360) : le vrai effet est
   « libérer l'instrument pour re-rentrer plus souvent », pas « payer moins de swap ». C'est un autre mécanisme,
   fortement dépendant de la période.
3. **Aucune confirmation hors échantillon** : sur 25 ans, TOUTES les variantes de cull restent négatives (−0.5 à −1.4R/an).
Même schéma que le filtre multi-timeframe (section 2) : beau sur la fenêtre récente, invalidable ailleurs. **Rejeté.**

### ⚠️ LE VRAI LEVIER : compte SANS SWAP
Les swaps coûtent ~63% de l'edge brut. Aucune optimisation de stratégie ne récupère ça. Or des prop firms proposent
des comptes **swap-free par défaut** (ex. Funded Trading Plus, d'après recherche 2026) ; chez FTMO le swap-free est
réservé aux comptes islamiques (preuve de religion requise). **Choisir un broker sans swap vaut plus que toute
optimisation de stratégie.** À instruire avant tout achat de challenge : comparer les firmes sur (swap, règles swing,
réputation de paiement), pas seulement sur le prix du challenge.

### 🚨 MISE EN GARDE HONNÊTE — l'écart 2 ans vs 25 ans
Toutes les configs sont **3 à 5x meilleures sur les 2 dernières années que sur 25 ans**. Exemple net de swap :
MR-A = 5.3R/an récemment mais 1.7R/an en moyenne longue, avec une **période 2015-2020 quasi plate (+1.2R en 6 ans,
PF 1.04)**. Le trend 1h ne peut PAS être testé sur 25 ans (données 1h limitées à 2 ans) — sa robustesse longue est
donc INCONNUE. Conséquence : l'estimation "~4.4 mois pour le challenge" repose sur la fenêtre récente et est
probablement optimiste. Fourchette honnête : entre ~2R/an (scénario long terme) et ~12R/an (scénario récent).

### Vérification faite (2026-07-29) — et le chiffre qui tranche
**Recherche FTMO** : FTMO facture bien des swaps, qualifiés de « substantiels » sur US30/US500, et **ses taux diffèrent
de ceux des autres brokers pour le même CFD**. Les taux ne sont lisibles que dans la spécification de contrat de la
plateforme. ⇒ **Les taux relevés par l'utilisateur viennent de SON démo, qui n'est peut-être pas FTMO. À confirmer
(serveur MT5) avant toute décision.**

**Objection « le sans-swap se rattrape sur les spreads » — quantifiée (`spread_vs_swap.mjs`) :**
| Coût sur 2 ans | Total | Par an |
|---|---|---|
| Spread | 2.4R | 1.20R |
| **Swap** | **27.2R** | **13.58R** |

Le swap coûte **11.3x plus cher que le spread**. Point mort : il faudrait que le compte sans swap ait des spreads
**12x plus larges** pour annuler le bénéfice. Même à spreads ×10, le sans-swap gagne encore +2.8R/an.
⇒ **La crainte des spreads élargis est un non-sujet pour cette stratégie.** Le compte sans swap est robustement supérieur.

### Critères de due diligence pour choisir une firme (à instruire, décision utilisateur)
1. Swap : réellement zéro sur indices ET or, sans « frais d'administration » de substitution.
2. Règles swing : positions autorisées la nuit ET le week-end (bloquant, cf. section 7).
3. Réputation de paiement : historique de payouts vérifiable, ancienneté de la firme.
4. Coût total 12 mois (frais de challenge + resets + éventuels frais plateforme/payout), pas seulement le prix affiché.
5. Robots/EA autorisés.
⚠️ Ne pas arbitrer sur le seul critère du swap : une firme sans swap mais peu fiable sur les paiements est un moins bon deal.

## Prochaines étapes possibles
1. ~~Déployer MR-A dans le robot~~ ✅ FAIT le 2026-07-02 (commit 695e47f).
2. TP 4R sur le trend : écarté (aucun gain sur la config live 1h).
3. Challenge réel : risque 1%/trade pendant les phases, puis 0.5-0.7% sur le compte financé (voir section 5).
