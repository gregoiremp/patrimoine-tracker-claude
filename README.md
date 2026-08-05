# Patrimoine — suivi financier local (créé avec Claude)

Petit dashboard de suivi patrimonial façon Finary, généré avec [Claude](https://claude.ai) (Anthropic) — sans backend, sans compte, sans envoi de données sur internet. Tout tourne dans le navigateur, les données restent en `localStorage`.

## Fonctionnalités

- **Vue d'ensemble** : patrimoine net, liquidités vs placements, évolution dans le temps, répartition par type de compte, allocation cible vs réelle (stratégie type "ABC" Sécurisé/Croissance/Performance), dépenses du mois.
- **Comptes & placements** : comptes bancaires, livrets, assurance-vie, PEA, compte-titres, épargne salariale, immobilier, crypto, crédits — avec historique de solde, note libre par compte, et répartition en % entre les 3 poches de risque.
- **Dépenses** : import d'extraits CSV/Excel avec détection automatique des colonnes et catégorisation par mots-clés, ou saisie manuelle. Filtres par mois/catégorie/compte.
- **Catégories** : personnalisables, avec mots-clés pour l'auto-catégorisation à l'import.
- **Données** : allocation cible éditable, export/import JSON pour sauvegarder ou migrer ses données.

## Lancer en local

```bash
python3 -m http.server 8743
```

puis ouvrir `http://localhost:8743`. L'import CSV fonctionne hors ligne ; l'import Excel (`.xlsx`) charge [SheetJS](https://sheetjs.com) via CDN et nécessite donc une connexion internet (sinon, exporter son relevé en CSV).

## Confidentialité

Aucune donnée personnelle n'est stockée dans ce dépôt. Toutes les données saisies (comptes, soldes, dépenses) restent uniquement dans le `localStorage` du navigateur de la personne qui utilise l'app, sur sa machine. Pour sauvegarder ou transférer ses données, utiliser l'export/import JSON depuis l'onglet **Données**.
