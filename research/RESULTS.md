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

### Firmes sans swap — recherche du 2026-07-29 (À VÉRIFIER PAR L'UTILISATEUR, conditions changeantes)
✅ **Confirmé : le démo de l'utilisateur EST un démo FTMO** → les taux relevés sont les VRAIS taux FTMO. Analyse validée.

| Firme | Swap-free | Week-end / swing | Notes |
|---|---|---|---|
| **FTMO** (actuel) | ❌ sauf compte islamique (justificatif de religion) | ✅ compte Swing | Établi, paiements reconnus. **Aucune option payante sans swap trouvée.** |
| **Funded Trading Plus** | ✅ **par défaut et gratuit** (1-Step Express, 2-Step Classic) depuis fév. 2026 | ✅ sur ces 2 formules (❌ sur Instant : clôture vendredi 16h30) | Split 80%, EA autorisés, grid & copy interdits. ~19.5M$ payés annoncés. |
| **FundedNext** | ✅ add-on payant **+10%** du prix du challenge | à vérifier | L'add-on 10% que certaines sources attribuent à tort à FTMO est en réalité de FundedNext. |
| FundedFast / Goat Funded / Lux / Maven | ✅ annoncé | ✅ annoncé | Non instruits en détail — à vérifier si présélectionnés. |

⚠️ **Erreur de source rencontrée** : plusieurs articles affirment que « FTMO propose le swap-free pour +10% ». Vérification
faite : cette offre est celle de **FundedNext**, pas de FTMO. Ne pas acheter sur cette base sans confirmation directe.

**Valeur de l'enjeu** : le swap coûte 13.58R/an = **~13 580$/an sur un 100k à 1% de risque**. Même un surcoût de 10%
sur le prix du challenge (~54€) serait dérisoire face à ça. Durée estimée jusqu'au financement à 1.5% de risque :
**~10.5 mois avec swaps** (config spécialisée) contre **~4.5 mois sans swap** (panier complet). Le sans-swap divise
le délai par deux ET permet de garder le panier complet (plus diversifié, moins de dépendance à l'or).

### Critères de due diligence pour choisir une firme (à instruire, décision utilisateur)
1. Swap : réellement zéro sur indices ET or, sans « frais d'administration » de substitution.
2. Règles swing : positions autorisées la nuit ET le week-end (bloquant, cf. section 7).
3. Réputation de paiement : historique de payouts vérifiable, ancienneté de la firme.
4. Coût total 12 mois (frais de challenge + resets + éventuels frais plateforme/payout), pas seulement le prix affiché.
5. Robots/EA autorisés.
⚠️ Ne pas arbitrer sur le seul critère du swap : une firme sans swap mais peu fiable sur les paiements est un moins bon deal.

## 9. ENQUÊTE FIRMES (2026-07-29) — 🚨 LA RÈGLE DE CONSISTANCE ANNULE LE BÉNÉFICE DU SANS-SWAP

> Simulation complète des DEUX jeux de règles (`mc_firms.mjs`, 20 000 sims chacun).
> Découverte : le sans-swap ne suffit pas. Il faut aussi l'absence de **règle de consistance**.

### Funded Trading Plus 2-Step Classic — règles réelles
Sans swap ✅ | cible **7% par phase** | DD max **8% statique** | DD jour **4%** | **RÈGLE DE CONSISTANCE 35%**
(aucun jour ne peut représenter >35% du profit net total de la phase).
Réputation : Trustpilot 4.7/5 sur 4 500+ avis ; la firme publie un taux de refus de retrait de 1.74% (fraude/KYC) —
transparence rare. Points noirs relevés dans les avis 1★ : revue de risque **discrétionnaire** (refus possible pour
« risque excessif » sans violation de règle) et blocages KYC après réussite.

### Résultats Monte Carlo — jusqu'au compte financé
| Config | Médiane | ≤6 mois | Frais moyens |
|---|---|---|---|
| **FTMO 1.5%** (swaps, PAS de consistance) | **4.7 mois** | **57%** | 1 186€ |
| FTMO 1.25% | 6.4 mois | 47% | 1 148€ |
| FT+ 1.5% (sans swap, consistance 35%) | **12.7 mois** | 21% | 1 675€ |
| FT+ 1.0% (sans swap, consistance 35%) | 12.2 mois | 23% | 775€ |
| *Contrôle : FT+ 1.5% SANS consistance* | *2.8 mois* | *83%* | *1 134€* |

**Pourquoi la consistance nous tue** : notre stratégie gagne par à-coups. Un +3R à 1.5% de risque = +4.5% en une
journée, soit **64% d'une cible à 7%** — très au-dessus des 35% autorisés. Il faut alors continuer à trader pour
« diluer » ce jour, ce qui rallonge massivement et expose au drawdown. Coût mesuré de la règle : **+10 mois**.

⇒ **CONCLUSION INVERSÉE : FTMO (4.7 mois) bat Funded Trading Plus (12.7 mois) malgré les swaps.**
L'absence de règle de consistance chez FTMO vaut plus que ses swaps.

### Le profil recherché (cahier des charges complet)
Swap-free **ET** pas de règle de consistance **ET** week-end autorisé (évaluation ET compte financé) **ET** DD ≥8%
**ET** firme fiable. Combinaison rare. Vérifications faites :
- **FXIFY** : pas de swap-free ❌ (week-end OK)
- **FundingPips** : pas de swap-free ❌ ; pas de consistance ✅ mais week-end interdit sur comptes financés depuis
  le 2026-01-29 ❌ (bloquant)
- **Velotrade / Blueberry Funded** : annoncés sans consistance — statut swap non vérifié, à instruire
Si ce profil est trouvé : **~2.8 mois médiane, 83% ≤6 mois**. C'est l'objectif de recherche.

## 10. 🎯 CANDIDAT TROUVÉ : FT+ **1-STEP EXPRESS** (2026-07-29) — ce n'est PAS la formule 2-Step analysée en section 9

**Erreur corrigée** : la section 9 analysait la formule *2-Step Classic* de Funded Trading Plus (consistance 35% ⇒ disqualifiée).
La formule **1-Step Express** de la même firme est différente et coche TOUT :
sans swap ✅ | **AUCUNE règle de consistance** ✅ | week-end/overnight ✅ | **UNE SEULE phase, cible 10%** ✅
| DD max **8% statique** (⚠️ une option 6% *trailing* existe — **il FAUT choisir le statique**) | DD jour 4%.

### Monte Carlo — parcours jusqu'au compte financé (`mc_ft1step.mjs`, 20 000 sims)
| Config | Médiane | 90e pct | ≤6 mois | Frais moyens |
|---|---|---|---|---|
| FTMO 1.5% (2 phases, swaps) | 4.7 mois | 11.7 | 57% | 1 192€ |
| FTMO 1.25% | 6.4 mois | 16.6 | 48% | 1 147€ |
| **FT+ 1-Step 1.0%** | **2.8 mois** | 9.1 | **82%** | 675€ |
| **FT+ 1-Step 1.25%** | **2.3 mois** | 5.4 | **94%** | 784€ |
| **FT+ 1-Step 1.5%** | **1.7 mois** | 4.4 | **99%** | 860€ |

**Trois effets cumulés** : pas de swap (~la moitié de l'edge récupérée) + **une seule phase au lieu de deux** +
pas de consistance. Le DD jour à 4% (vs 5% FTMO) s'avère **sans impact** (test de sensibilité : résultats identiques).

### ❌ Goat Funded Trader — écarté
Sans swap ✅, week-end ✅, pas de consistance pendant le challenge ✅ — **MAIS règle de consistance 15% une fois FINANCÉ**
(pire que 35%), plafond sur les 2 premiers payouts, et friction de paiement bien documentée dans les avis négatifs.

### ⚠️ À VÉRIFIER AVANT TOUT ACHAT (bloquants)
1. **Prix réel** du 1-Step Express 100k (hypothèse 600€ dans la sim ; une source évoque ~199$/10k = ~1 990$ — à confirmer,
   le prix ne change pas le délai mais change le budget).
2. **Choisir le DD 8% STATIQUE**, jamais le 6% trailing (un trailing tuerait la stratégie).
3. **Règles du compte FINANCÉ** (pas seulement de l'évaluation) : consistance ? week-end ? plafond de payout ?
   C'est le piège de Goat — vérifier que FT+ ne fait pas pareil.
4. Fiabilité : Trustpilot 4.7/5 sur 4 500+ avis, 1.74% de refus publiés ; points noirs = revue de risque discrétionnaire, KYC.
5. Confirmer que le sans-swap couvre bien **indices ET or**.

## 11. ✅ BILAN FORWARD-TEST — CRITÈRES GO ATTEINTS (2026-08-24)

**Durée 9.1 semaines | 21 trades clôturés | résultat NET +3 537$ = +3.54% du compte 100k à 1% de risque.**

| Critère GO (fixé à froid le 2026-07-07) | Seuil | Réel | Verdict |
|---|---|---|---|
| Durée | ≥8 semaines | 9.1 | ✅ |
| Trades clôturés | ≥20 | 21 | ✅ |
| Taux de réussite trend | 25-45% | **33%** (6/18) | ✅ |
| Incidents techniques | 0 | 0 (robot en ligne en continu) | ✅ |

### Détail par stratégie (clôturé, swaps réels inclus)
| | Trades | Réussite | Brut | Swap | **NET** |
|---|---|---|---|---|---|
| Trend 1h | 18 | 33% | +6 000$ | −2 604$ | **+3 396$** |
| MR-A | 3 | 67% | +220$ | −79$ | **+141$** |
| **Total** | **21** | — | **+6 220$** | **−2 683$** | **+3 537$** |

Positions ouvertes : 2 MR (US100, US500), latent −306$. **Swap total payé depuis le début : 2 775$.**

### Lectures importantes
- **Rythme NET observé : 1.69R/mois** contre ~1.25R/mois attendu au backtest ⇒ le système fait *mieux* que prévu.
  ⚠️ Août a été exceptionnel (+8.88R brut sur le mois) — ne pas extrapoler, 18 trades restent un petit échantillon.
- **Le taux de réussite du trend (33%) colle à la théorie (30.5%)** — le moteur se comporte comme conçu.
- **Les swaps ont coûté 2 775$ = 44% du profit brut.** L'analyse de la section 6 est confirmée en conditions réelles.
- **Les marathons restent gagnants** : l'US30 tenu 43 jours a payé 1 080$ de swap et rapporté **+1 920$ net**.
  Confirme qu'il ne faut pas couper les trades longs.
- Le trade MR à +40$ (30/07) reste hors distribution du backtest, mais les 3 trades MR ne permettent aucune conclusion.

### ⇒ DÉCISION : GO sur les critères. Reste à trancher la firme (section 10) avant tout achat.

## 12. 📖 RÈGLES RÉELLES FT+ 1-STEP EXPRESS (lues sur help.fundedtradingplus.com, 2026-08-24)

⚠️ **CORRECTION D'UNE ERREUR DE LA SECTION 10** : j'y avais simulé un DD de **8% statique**. La documentation
officielle dit **6% RELATIF (trailing)**. Le « 8% statique » venait d'un article tiers, pas de la source. Corrigé.

### Ce que dit la doc officielle
| Règle | Valeur |
|---|---|
| Cible | 10% simulé, **une seule phase** |
| Perte max | **6% relatif — TRAILING sur le plus-haut du solde**, plafonné au solde initial (une fois +6% atteint, le plancher se verrouille au capital de départ) |
| Perte journalière | 4% |
| Swap | ✅ **Sans swap confirmé** sur 1-Step Express, 2-Step Classic et Instant (depuis fév. 2026) |
| Week-end / overnight | ✅ autorisé |
| Stop loss obligatoire | ❌ non |
| Limite de temps | ❌ aucune, mais **1 trade minimum tous les 30 jours** sinon compte cassé |
| Split | 80%, retrait dès qu'on est en profit, minimum 50$, puis tous les 7 jours |
| Consistance | **non mentionnée pour le 1-Step Express** (le 2-Step Classic a 35% ; « stade financé 50% » évoqué sans préciser les programmes concernés) |

### Simulations corrigées (`mc_ft_vraies_regles.mjs`)
| Config | Médiane | 90e pct | ≤6 mois | Frais moyens |
|---|---|---|---|---|
| FTMO 1.5% (10%+5%, DD 10% statique, swaps) | 5.1 mois | 14.4 | 56% | 1 055€ |
| **FT+ 1-Step 1.0%** (vraies règles) | **2.7 mois** | 5.7 | **93%** | 1 108€ |
| **FT+ 1-Step 1.25%** | **2.0 mois** | 5.4 | **94%** | 1 279€ |
| *(mon ancienne simu erronée à 8% statique, 1.25%)* | *2.3 mois* | *5.5* | *92%* | *766€* |

**Effet du trailing** : médiane meilleure mais **frais ~2x plus élevés** (1 108€ ≈ 1.85 tentative). Le trailing crée un
profil « ça passe vite ou ça casse vite ». FT+ reste ~2x plus rapide que FTMO pour un coût comparable.

### 🚨 Le vrai risque : le drawdown historique dépasse la limite à TOUT niveau de risque
maxDD historique net de swap = **14.6R**. À 0.5% de risque → 7.3% ; à 1% → 14.6% ; à 1.5% → 21.9%.
**Tous dépassent les 6%.** Ça ne marche que parce qu'on atteint souvent +10% AVANT de subir le gros drawdown —
c'est une course. D'où le taux d'échec (~1 tentative perdue en moyenne) déjà intégré aux frais ci-dessus.

### ❓ 4 POINTS NON RÉSOLUS — à demander à support@fundedtradingplus.com AVANT d'acheter
1. **Sans-swap : quels instruments ?** La page ne liste PAS les instruments. Confirmer indices ET or (XAUUSD).
2. **Symbol Loss Limit** : règle par instrument, % « déterminé par votre programme », non publié pour le 1-Step
   Express, et son dépassement = **hard breach** (compte terminé). On trade l'or intensivement → risque réel. Exiger le %.
3. **Compte financé + retraits** : la doc dit que le plancher se verrouille au solde initial et que **les retraits ne
   réduisent pas le high water mark**. Si on retire les profits pour revenir vers 100k alors que le plancher est à 100k,
   la moindre perte casse le compte. **Faire préciser le fonctionnement exact du plancher après un retrait.**
4. **Consistance 50% au stade financé** : s'applique-t-elle aux comptes issus du 1-Step Express ?

## 13. 💶 PRIX RÉELS ET TROISIÈME OPTION (2026-08-24)

**Découverte : FTMO propose AUSSI un challenge 1-STEP** (une seule phase, cible 10%) — on ne raisonnait que sur le 2-Step.

| Offre | Prix 100k | Phases | DD max | DD jour | Swap | Frais remboursés |
|---|---|---|---|---|---|---|
| FTMO 2-Step | **540€** | 10% + 5% | 10% statique | 5% | ❌ | ✅ au 1er payout |
| FTMO 1-Step | **499€** | 10% | 10% statique | 5% | ❌ | ❌ non |
| FT+ 1-Step Express | **549$** | 10% | 6% **trailing** | 4% | ✅ | ❓ à confirmer |

FT+ : levier 1:30 (non contraignant pour nous), **pas de règle de consistance**, split **80% → 90% à +20% de profit
cumulé → 100% à +30%**, retraits dès le 1er jour puis tous les 7 jours.

### Simulations avec vrais prix et vraies règles (`mc_1step_vs_1step.mjs`)
| Offre | Médiane | ≤6 mois | Coût net moyen |
|---|---|---|---|
| FTMO 2-Step 1.25% | 6.8 mois | 46% | **491€** |
| FTMO 1-Step 1.25% | 3.0 mois | 79% | 678€ |
| **FT+ 1-Step 1.25%** | **2.0 mois** | **95%** | 1 066€ |
| FTMO 2-Step 1.5% | 5.1 mois | 56% | 518€ |
| FTMO 1-Step 1.5% | 2.4 mois | 93% | 698€ |
| **FT+ 1-Step 1.5%** | **1.6 mois** | **99%** | 1 050€ |

**Arbitrage** : FT+ est le plus rapide et le plus sûr, mais ~350-400€ plus cher en coût attendu (le DD 6% trailing
provoque plus d'échecs). FTMO 1-Step est un excellent intermédiaire. FTMO 2-Step est le moins cher grâce au
remboursement, mais 2-3x plus lent.

⚠️ **Mais l'arbitrage réel ne se joue pas là** : le sans-swap vaut ~13 580$/an **sur le compte financé**
(section 6). Un surcoût unique de 400€ au challenge est négligeable face à ça. Le challenge dure 2 mois,
le compte financé dure des années.

## 14. 🎯 L'INTUITION DE L'UTILISATEUR VALIDÉE — le 6% trailing annule l'avantage du sans-swap

> Question posée par l'utilisateur : « même si je passe le test je serai toujours à 6%, donc il faudra descendre
> sous 1% de risque, et ça revient au même qu'un FTMO à 10% niveau rentabilité ? »
> **Réponse : oui — et en scénario pessimiste, c'est même PIRE.** (`compte_finance.mjs`)

Simulation : 12 mois de compte financé, **avec retraits mensuels** (le cas réaliste), split 80%.

| Offre | Risque optimal | Survie 12 mois | **Espérance de revenu/an** |
|---|---|---|---|
| **FT+ pessimiste** (plancher NON recalé après retrait) | 0.20% | 100% | **4.7% du compte** |
| **FT+ optimiste** (plancher recalé après retrait) | 0.50% | 100% | **11.8% du compte** |
| **FTMO** (10% statique, avec swaps) | 0.70% | 95% | **9.7% du compte** |

**Mécanisme** : le sans-swap double le rendement brut, MAIS le plancher à 6% force un risque ~3x plus faible
(0.2-0.5% contre 0.7%). Les deux effets se compensent presque exactement. À 0.5% de risque chez FT+ en scénario
pessimiste, la survie tombe à **0%** sur 12 mois ; à 0.7%, 0% également.

### ⚠️ CORRECTION D'UN BIAIS DE MES ANALYSES PRÉCÉDENTES
J'avais chiffré le sans-swap à « ~13 580$/an d'économies » (section 6) **à risque constant**. C'était trompeur :
un plancher plus serré interdit de tenir le même risque. Comparaison correcte = **espérance à risque optimal
pour chaque offre**, et là l'écart tombe à ~20% en faveur de FT+ (11.8% vs 9.7%) — et s'inverse en défaveur
de FT+ (4.7% vs 9.7%) si la lecture pessimiste du plancher est la bonne.

### ⇒ TOUTE LA DÉCISION TIENT À LA QUESTION 3 DU MAIL
- Plancher recalé après retrait → FT+ (11.8%/an) devance FTMO (9.7%/an), mais modestement.
- Plancher non recalé → **FTMO gagne largement** (9.7% contre 4.7%) et FT+ devient inadapté à cette stratégie.
Aucune autre question ne pèse autant. Sans réponse écrite sur ce point, ne pas acheter FT+.

## 15. ✉️ RÉPONSE OFFICIELLE DU SUPPORT FT+ (reçue 2026-09) — et décision finale

| Question | Réponse | Verdict |
|---|---|---|
| 1. Sans swap | « swap-free across all available platforms », overnight et week-end autorisés | ✅ |
| 2. Symbol Loss Limit | **« There is no Symbol Loss Limit for the 1-Step Express »** | ✅ risque éliminé |
| 3. Plancher après retrait | **Scénario PESSIMISTE CONFIRMÉ PAR ÉCRIT** : « balance $101,000, floor remains at $100,000, a further $1,000 loss would breach » | ❌ |
| 4. Consistance | Aucune règle de consistance sur le 1-Step Express | ✅ |
| 5. Trading automatisé | Réponse évasive (renvoi vers la politique) — **non confirmé explicitement** | ⚠️ |
| 6. Remboursement | **Pas de remboursement** des frais au 1er payout | ❌ |

### 🛡️ LA PARADE : garder un coussin (ne pas tout retirer) — ça marche (`ftplus_coussin.mjs`)
Le plancher figé ne tue le compte que si on retire jusqu'à lui. En ne retirant que ce qui dépasse un coussin :

| Coussin gardé | Risque | Survie 12 mois | Espérance/an |
|---|---|---|---|
| 0% (tout retirer) | 0.5% | **0%** ☠️ | 0% |
| 4% | 0.5% | 57% | 6.2% |
| **6%** | **0.5%** | **100%** | **11.0%** |
| 6% | 0.7% | 35% | 7.1% |

**Optimum FT+ : 0.5% de risque + coussin de 6% → 100% de survie, 11.0%/an.**
**Optimum FTMO : 0.7% de risque → 95% de survie, 9.7%/an.**

### ⚠️ DÉCOUVERTE PARALLÈLE : FTMO 1-Step n'a PAS d'option Swing
Le compte financé issu d'un 1-Step FTMO est de type Standard ⇒ **fermeture obligatoire avant le week-end**,
incompatible avec notre stratégie. Chez FTMO, la seule voie viable est donc le **2-Step Swing à 540€** (5.1 mois
de médiane), pas le 1-Step à 499€ (2.4 mois) qu'on envisageait.

### ⇒ COMPARAISON FINALE
| | FT+ 1-Step Express | FTMO 2-Step Swing |
|---|---|---|
| Prix | 384$ (promo) — non remboursé | 540€ — **remboursé au 1er payout** |
| Temps jusqu'au financement | **2.0 mois** (95% ≤6 mois) | 5.1 mois (56%) |
| Revenu compte financé | **11.0%/an** (0.5% risque + coussin 6%) | 9.7%/an (0.7% risque) |
| Robustesse des règles | 6% trailing, discipline du coussin obligatoire | 10% statique, plus simple |
| Contrepartie | Firme plus jeune, revue de risque discrétionnaire | Firme établie, historique long |

**FT+ gagne sur les chiffres (2.5x plus rapide, +13% de revenu), FTMO gagne sur la robustesse et la simplicité.**
Reste à lever le point 5 (trading automatisé) avant achat.

## 16. 🔍 AUDIT FINAL AVANT PASSAGE EN RÉEL (2026-08-29)

### A. État du forward-test — 9.7 semaines
| | Trades | Réussite | Total |
|---|---|---|---|
| Trend | 21 | **29%** (théorie 30.5%) ✅ | +3.00R |
| MR | 5 | 40% | +0.01R |
| **Total** | **26** | — | **+3.01R** |
Le trend reste parfaitement calibré. **MR sous-performe** (5 trades, +0.01R).

### B. ⚠️ RECALIBRAGE DE MES PROPRES CHIFFRES SUR MR
Je citais « MR = 0.226R/trade, 82.7% de réussite ». C'était la fenêtre de **2 ans**, exceptionnellement favorable.
Sur **25 ans : 601 trades, 74% de réussite, +0.126R/trade** — soit **presque 2x moins**. Les 5 trades live
(+0.002R/trade) sont sous cette moyenne mais dans le bruit pour un si petit échantillon.

### C. ✅ AMÉLIORATION VALIDÉE : supprimer la sortie « close > SMA5 » de MR
Répartition des sorties (25 ans) : RSI2>65 = 72% des sorties à **+0.30R** ; close>SMA5 = 18% à **+0.10R** seulement.
En supprimant cette sortie faible :
| | 25 ans | Sous-périodes | Par instrument |
|---|---|---|---|
| Actuel | +67.4R, PF 1.82 | — | — |
| **Sans close>SMA5** | **+72.1R (+7%)**, PF 1.83 | meilleur sur 2/4, égal sur 2/4 | **meilleur sur les 3** |
Amélioration modeste mais robuste, et c'est une **simplification** (on retire une condition), pas un ajout de paramètre. ✅ À retenir.

### D. 🎯 RISQUE ET CAP — LA DÉCOUVERTE STRUCTURELLE
**Contrainte dure** : limite journalière FT+ = 4%. Si toutes les positions sautent le même jour :
`cap × risque` doit rester < 4%. Donc **cap 3 ⇒ 1.25% maximum** ; à 1.5% avec cap 3, une journée noire = breach.

Mais **baisser le cap à 2 domine sur tous les critères** (moins de positions = meilleurs signaux : PF 1.48 vs 1.35) :
| Config | Pire jour | Réussite 1re tentative | Médiane | Coût moyen |
|---|---|---|---|---|
| cap 3 @ 1.0% | 3.00% ✅ | 44% | 2.7 mois | 743$ |
| cap 3 @ 1.25% | 3.75% ✅ | 40% | 2.0 mois | 865$ |
| cap 2 @ 1.5% | 3.00% ✅ | 50% | 1.9 mois | 683$ |
| **cap 2 @ 1.75%** | **3.50% ✅** | **51%** | **1.6 mois** | **696$** |
⇒ **cap 2 @ 1.75% bat cap 3 @ 1.25% sur les trois métriques à la fois.**

### E. 🚨 LE POINT INCONFORTABLE : le compte financé FT+ reste fragile
Même optimisé (cap 3, coussin 8%, risque 0.5%) : **79% de survie sur 12 mois**, espérance **9.3%/an**.
FTMO (10% statique, avec swaps, 0.7%) : **95% de survie**, espérance **9.7%/an**.
⇒ **Les deux firmes donnent le même revenu attendu (~9.5%/an). FTMO est simplement plus robuste.**
L'avantage réel de FT+ n'est donc PAS la rentabilité — c'est **la vitesse pour être financé** (1.6 vs 5.1 mois).
Nuance : chez FT+, perdre le compte coûte 384$ et ~1.6 mois pour revenir ; ce n'est pas irréversible.

## 17. 💵 LA MÉTRIQUE QUI TRANCHE : LE CASH RÉELLEMENT ENCAISSÉ (2026-08-29)

> Objection de l'utilisateur : « chez FT+ il faut d'abord constituer le coussin, donc même si tout va bien
> je ne peux rien retirer avant longtemps — c'est donc plus long à encaisser que FTMO. »
> **Il a raison.** Toutes mes comparaisons précédentes mesuraient la vitesse pour être *financé*, pas pour
> *toucher de l'argent*. Simulation de bout en bout sur 24 mois (`audit_cash.mjs`), séquences construites à l'identique :

| Offre | Cash net médian / 24 mois | 1er retrait (médiane) | N'encaisse jamais |
|---|---|---|---|
| FT+ coussin 4% | 2 921$ | 6.4 mois | 14% |
| FT+ coussin 6% | 8 070$ | 8.8 mois | 20% |
| FT+ coussin 8% | 6 540$ | 11.0 mois | 25% |
| FT+ coussin 8% @0.7% | −384$ | 6.2 mois | **55%** |
| **FTMO 2-Step @1.25% puis 0.7%** | **8 731$** | **8.5 mois** | **7%** |
| FTMO 2-Step @1.0% puis 0.7% | 7 337$ | 10.8 mois | 9% |

**⇒ FTMO gagne sur les TROIS critères** : plus de cash (8 731$ contre 8 070$), premier retrait plus tôt
(8.5 contre 8.8 mois), et surtout **3x moins de risque de ne jamais rien encaisser** (7% contre 20%).

**Mécanisme** : le coussin obligatoire de FT+ immobilise 6-8% de profit avant tout retrait. Sur un compte 100k
à 0.5% de risque, constituer 8% prend ~7 mois — ce qui annule complètement l'avance prise au challenge
(1.6 mois contre 5.1). L'avantage « être financé plus vite » était un mirage : ce qui compte, c'est encaisser.

### ⚠️ Correction de méthode (incohérence signalée par l'utilisateur : « pourquoi 8% et plus 6% ? »)
Mes recommandations de coussin ont bougé (6% → 8%) parce que j'avais **changé la construction de la séquence
entre deux runs** (cap total appliqué ou non), sans le dire. Corrigé ici : séquences identiques partout.
Avec la mesure cohérente, **6% bat 8% sur le cash** (8 070$ contre 6 540$).

### ⇒ RECOMMANDATION FINALE INVERSÉE : **FTMO 2-Step Swing**
Challenge à **1.25%** (cap 3, pire jour 3.75% < 5% de limite FTMO), puis compte financé à **0.7%**, sans coussin
imposé, retrait dès le premier profit, frais de 540€ **remboursés** au premier payout.
FT+ conserve un avantage théorique (sans swap) mais ses règles — plancher trailing figé + coussin obligatoire —
le lui reprennent intégralement pour cette stratégie.

## 18. 🔬 PISTE FUTURES INVESTIGUÉE PUIS ÉLIMINÉE (2026-08-29)

**Idée** : les futures n'ont PAS de swap overnight (le portage est dans le prix). Nos 4 instruments existent en
futures (ES/NQ/YM/GC). Une prop firm futures autorisant l'overnight supprimerait le problème des swaps.

**La plupart des firmes futures interdisent l'overnight** (Topstep, Apex, Tradeify liquident à la clôture).
Exception trouvée : **Phidias Premium** — relevé sur leur site le 2026-08-29 :
100K à **180$** (code PHIDIAS80, 450$ sans) | **drawdown 3 000$ EOD trailing** | **objectif 6 000$** | 1 jour min
| overnight + week-end autorisés (évaluation ET compte financé) | payouts tous les 5 jours | split 75%→100%
| Cash Account Reset 1x | max 14 minis / 140 micros.

### ❌ ÉLIMINÉ POUR UNE RAISON PRATIQUE IMPARABLE : la granularité des contrats
On ne peut pas acheter une fraction de contrat. Risque **minimum** avec UN SEUL contrat micro, aux distances de
stop réelles du forward-test :
| Instrument | Contrat micro | Stop médian | **Risque minimum** |
|---|---|---|---|
| US30 | MYM (0.50$/pt) | 574 pts | **287$** |
| US500 | MES (5$/pt) | 85 pts | **423$** |
| XAUUSD | MGC (10$/pt) | 60 pts | **598$** |
| US100 | MNQ (2$/pt) | 579 pts | **1 157$** |

Or le drawdown de 3 000$ impose, pour survivre au pire drawdown historique (11.1R), un risque max de **270$/trade**.
**Même le contrat le moins cher (287$) dépasse déjà cette limite.** Sur un 150K (drawdown ~4 500$, risque max 405$),
seul l'US30 passerait — impossible de faire tourner la stratégie sur ses 4 instruments.
⇒ **La piste futures est structurellement fermée pour cette stratégie.** Dossier clos.

## 19. 📊 COMPARATIF FINAL DES 3 OFFRES — cash encaissé sur 24 mois (`comparatif_v2.mjs`)

| Offre | Cash médian | Cash moyen | 1er retrait | Ne touche **jamais** rien |
|---|---|---|---|---|
| Phidias (futures) | — | — | — | **inapplicable** (granularité) |
| FT+ ch 1.75% / fin 0.5% / coussin 6% | **11 640$** | 8 080$ | 7.3 mois | **30%** |
| FT+ ch 1.75% / fin 0.7% / coussin 6% | −384$ | 4 253$ | 5.3 mois | 51% |
| FTMO ch 1.25% / fin 0.7% | 7 360$ | 6 220$ | 8.1 mois | 22% |
| **FTMO ch 1.0% / fin 0.7%** | **7 360$** | 6 769$ | 11.6 mois | **5%** |

**Arbitrage** : FT+ offre le meilleur médian (11 640$) mais **30% de chance de ne jamais rien encaisser**.
FTMO à 1% de risque au challenge ne rapporte que 7 360$ mais avec **5% seulement** de risque de repartir bredouille.
C'est un choix entre espérance et fiabilité, pas entre bon et mauvais.

## 20. 🔁 INTRADAY RE-TESTÉ (2026-08-29) — le rejet initial reposait sur une comparaison biaisée

> L'utilisateur : « c'est pour ça que j'ai toujours voulu qu'on fasse de l'intraday ».
> **Il a raison sur le principe** : l'intraday avait été écarté AVANT la découverte des swaps, donc comparé
> brut contre brut. Or l'intraday ne paie **aucun frais de nuit** — le biais était de 51%.

### Résultats (2 ans, 4 instruments, `intraday_v3.mjs`)
| Config | Trades/an | Réussite | PF | R net/an | maxDD | **Rendement / DD** |
|---|---|---|---|---|---|---|
| SWING actuel (swaps réels) | 115 | 31% | 1.08 | **7.2R** | 17.1R | 0.84 |
| **INTRADAY (clôture le soir, 0 swap)** | 444 | 49.5% | 1.06 | 6.0R | **11.7R** | **1.03** |

**L'intraday rend 83% du swing avec 68% du drawdown** ⇒ meilleur rapport rendement/risque. Robuste sur
4 semestres sur 5. Variantes testées et écartées : opening range breakout (PF 1.07 mais **100% du profit vient
de l'or**, 3 instruments sur 4 perdants, maxDD 65.6R ☠️) et mean-reversion intraday RSI4 (PF 0.72).

### Ce que l'intraday débloquerait structurellement
- **Aucun swap** — le poste qui mange 51% du brut disparaît
- **Plus besoin du compte Swing** ⇒ le **FTMO 1-Step devient jouable** (split **90%** au lieu de 80%, une seule phase)
- Toutes les prop firms futures intraday s'ouvrent (Topstep, Apex…), là où elles étaient fermées
- Zéro risque de gap de week-end

### ⚠️ Les deux réserves
1. **Charge d'exécution : 37 trades/mois (~1.8 par jour de bourse)** contre 10/mois aujourd'hui.
   Exécution manuelle difficilement tenable ⇒ imposerait le passage au VPS + exécution automatique.
2. **🚨 DÉPENDANCE À L'OR — et elle concerne AUSSI le système actuel :**

| Instrument | R intraday | R swing (net swaps) |
|---|---|---|
| S&P 500 | −4.4 | −4.1 |
| Nasdaq | +1.9 | +0.3 |
| Dow | −3.2 | +0.5 |
| **Or** | **+17.6** | **+17.6** |

**Sur les 2 dernières années, l'or produit la totalité du profit dans les DEUX versions.** Les indices ne
rapportent rien net de frais. C'est un constat inconfortable sur le système en production, pas seulement sur
l'intraday — à creuser avant tout engagement en réel.

## 21. 🔬 AUDIT INTRADAY COMPLET (2026-08-29) — toutes les questions re-posées

### A. Balayage des paramètres (`intra_full1.mjs`, 2 ans)
| Question | Résultat |
|---|---|
| Take profit | TP 4R (7.2R/an) > TP 3R (6.1) >> TP 2R (2.1) |
| Multiple de stop | 3x ATR optimal ; 1.5x et 2x détruisent tout (PF ~1.00) |
| Filtre de session | ❌ dégrade (2.5R/an contre 6.1) |
| Sens | shorts seuls : rdt/DD 1.90 ; longs seuls : 0.12 ⚠️ très dépendant de la période |
| **Panier** | or+Nasdaq **9.9R/an** > or seul 8.8 > 4 instruments 6.1 > **indices seuls −2.7** |

### B. Synthèse comparée
| Config | Trades/mois | PF | R/an | maxDD | rdt/DD |
|---|---|---|---|---|---|
| Intraday 4 instruments TP3R (non optimisé) | 37 | 1.07 | 6.1 | 11.7 | 1.04 |
| Intraday or+Nasdaq TP4R (optimisé) | 23 | 1.16 | 10.9 | 10.7 | **2.05** |
| **SWING actuel + MR (swaps réels)** | **10** | 1.16 | **13.0** | 14.6 | 1.78 |

### C. Simulation de challenge — la comparaison des options RÉELLEMENT ouvertes
Rappel : le swing ne peut PAS utiliser le 1-Step (pas de compte Swing ⇒ clôture forcée le week-end une fois financé).
L'intraday, lui, y a droit.
| Option viable | Médiane | ≤6 mois | Coût net | Split |
|---|---|---|---|---|
| **SWING sur 2-Step Swing** | **7.9 mois** | **42%** | **344€** | 80% |
| Intraday or+Nasdaq sur 1-Step | 8.3 mois | 27% | 502€ | 90% |
| Intraday 4 instruments sur 1-Step | 9.3 mois | 27% | 892€ | 90% |

⇒ **Le swing reste devant** : plus rapide, deux fois plus fiable, moins cher. L'intraday ne gagne que sur le split.

### D. 🚨 LES DEUX RISQUES MAJEURS DE L'INTRADAY
1. **Impossible à valider au-delà de 2 ans.** Les données horaires n'existent pas avant (limite Yahoo : 730 jours).
   Le trend-pullback daily et MR-A ont été validés sur **25 ans** ; l'intraday ne peut l'être que sur **2**.
   Tout réglage choisi ici est ajusté à une fenêtre unique, sans test hors échantillon possible. C'est une
   différence de nature, pas de degré.
2. **La version « optimisée » est du surapprentissage assumé** : choisir or+Nasdaq revient à garder les instruments
   qui ont gagné sur la période testée. La version honnête (4 instruments, non triée) fait 6.1R/an, pas 10.9.

### E. Charge d'exécution
23 à 37 trades/mois (~1 à 1.8 par jour de bourse) contre 10 aujourd'hui ⇒ exécution manuelle non tenable,
imposerait le passage préalable au VPS + exécution automatique.

### F. Futures toujours fermés
Même avec le drawdown intraday réduit (10.7R), le risque max chez Phidias 100K reste ~280$/trade, alors que le
contrat micro sur l'OR — la principale source de profit — en exige **598$**. Blocage inchangé.

### ⇒ CONCLUSION : l'intraday méritait le re-test, mais **le swing reste le meilleur choix**.

## 22. 🥇 LA CONCENTRATION SUR L'OR — conjoncturelle, pas structurelle (2026-08-29, `audit_or.mjs`)

> Constat inquiétant de la section 20 : sur 2 ans, l'or produit ~100% du profit. Structurel ou régime passager ?
> Réponse sur 25 ans de daily — la seule fenêtre où on peut trancher.

### A. Sur 25 ans, LES QUATRE instruments sont gagnants
| Instrument | PF | R total | R/an | maxDD |
|---|---|---|---|---|
| S&P 500 | 1.47 | +22.1 | 0.88 | 8.0 |
| Nasdaq 100 | 1.57 | +28.5 | 1.14 | 6.3 |
| Dow Jones | 1.46 | +22.8 | 0.91 | 9.1 |
| Or | **1.97** | **+40.3** | **1.61** | 12.3 |

L'or est le meilleur, mais **aucun n'est perdant**. L'edge n'est pas un edge « or », c'est un edge de suivi de tendance.

### B. 🔄 LE LEADERSHIP TOURNE — c'est le point clé
R par instrument et par tranche de 5 ans :
| Instrument | 2001-05 | 2006-10 | 2011-15 | **2016-20** | 2021-26 |
|---|---|---|---|---|---|
| S&P 500 | 2.8 | −2.2 | 5.8 | **+10.9** | 4.9 |
| Nasdaq | 7.9 | 0.6 | 4.4 | **+13.1** | 2.5 |
| Dow | −3.1 | 4.9 | 5.9 | **+12.2** | 3.0 |
| **Or** | 10.3 | 6.6 | 7.9 | **−2.7** ❌ | **18.2** |

**Sur 2016-2020, l'or a PERDU de l'argent pendant que les trois indices portaient tout le système.**
Part de l'or dans le profit total : 58% → 67% → 33% → **−8%** → 64%. Aujourd'hui on est dans une phase « or »,
exactement comme on était dans une phase « indices » il y a cinq ans.

### C. Diversifier rapporte, concentrer coûte
| Panier (25 ans) | PF | R/an | maxDD | rdt/DD |
|---|---|---|---|---|
| **4 instruments** | 1.61 | **4.55** | 17.6 | 6.46 |
| Indices seuls | 1.50 | 2.93 | 17.6 | 4.16 |
| Or + Nasdaq | 1.75 | 2.75 | **7.5** | **9.17** |
| Or seul | 1.97 | 1.61 | 12.3 | 3.28 |

**Le panier complet produit ~3x plus de R/an que l'or seul.** La diversification n'est pas décorative : c'est elle
qui a sauvé le système en 2016-2020.

### D. Nuance sur le constat de départ
Sur données DAILY, ces 2 dernières années, le S&P (+1.95R/an contre 0.79 en moyenne longue) et le Dow (+2.50 contre
0.77) ont fait **mieux** que leur moyenne historique. La domination écrasante de l'or observée en section 20 était
propre à la fenêtre **1h sur 2 ans**, pas une vérité générale.

### ⇒ CONCLUSION : garder les 4 instruments. Retirer les indices serait ajuster le système au régime actuel —
exactement l'erreur qu'on a évitée cinq fois. La concentration observée est un symptôme du marché de 2024-2026,
pas un défaut de conception.

## Prochaines étapes possibles
1. ~~Déployer MR-A dans le robot~~ ✅ FAIT le 2026-07-02 (commit 695e47f).
2. TP 4R sur le trend : écarté (aucun gain sur la config live 1h).
3. Challenge réel : risque 1%/trade pendant les phases, puis 0.5-0.7% sur le compte financé (voir section 5).
