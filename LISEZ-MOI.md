# Le Carnet — mode d'emploi

Un site d'articles très sobre. **Vous écrivez dans Word**, vous déposez le fichier
dans le dossier `articles`, et le site fabrique tout seul la page d'accueil
(les derniers articles en haut) et la page de lecture de chaque article.

```
mon-site/
├─ articles/              ← vos fichiers Word (un fichier = un article)
│   ├─ 2026-10-29-bienvenue-mode-d-emploi.docx
│   └─ Essais/            ← un sous-dossier = une rubrique
│       └─ 2026-10-21-lire-lentement.docx
├─ pages/                 ← pages fixes (« À propos »…)
├─ site.json              ← titre du site, slogan, auteur
├─ assets/                ← apparence (style.css) et polices
├─ build.py               ← le générateur (rien à modifier)
└─ .github/workflows/     ← la publication automatique
```

## 1. Écrire un article

Dans Word, utilisez les **styles** (onglet Accueil → galerie de styles) :

| Dans Word | Rôle sur le site |
|---|---|
| **Titre** | titre de l'article |
| **Sous-titre** | chapô : la phrase d'accroche sous le titre (facultatif) |
| **Titre 1, Titre 2, Titre 3** | intertitres (vos I., A., 1. si vous faites un plan) |
| **Citation** | bloc de citation |
| Listes à puces / numérotées, gras, italique, liens | repris tels quels |
| Notes de bas de page (Références → Insérer une note) | regroupées en « Notes » à la fin de l'article |
| Images (Insertion → Image) | reprises ; la première sert de vignette sur l'accueil. Renseignez le texte de remplacement. |

**Le nom du fichier compte :**

* `AAAA-MM-JJ-titre-court.docx` — la date lue dans le nom devient la date de publication
  (ex. `2026-10-29-mon-article.docx`). Sans date, le site utilise la date d'ajout du fichier.
* Un fichier dont le nom commence par `_` ou rangé dans un dossier `brouillons` **n'est jamais publié**.
* Les modifications suivies sont acceptées automatiquement ; les commentaires Word sont ignorés.
* Si le document n'a pas de style « Titre », le premier « Titre 1 » sert de titre, à défaut le nom du fichier.

Le site corrige tout seul les espaces avant `: ; ! ?` et dans les guillemets « » (espaces insécables).

## 2. Mettre le site en ligne (GitHub Pages, gratuit)

À faire une seule fois, depuis un navigateur — aucun logiciel à installer :

1. Créez un compte sur github.com, puis un **nouveau dépôt** (« New repository »), public.
2. Dans le dépôt : **Add file → Upload files**, glissez-y **tout le contenu** du dossier de ce site
   (y compris le dossier caché `.github` ; s'il n'apparaît pas, voir la remarque ci-dessous), puis **Commit changes**.
3. **Settings → Pages → Build and deployment → Source : « GitHub Actions »**.
4. Onglet **Actions** : attendez la coche verte (environ une minute). L'adresse du site s'affiche dans Settings → Pages.

**Publier un nouvel article ensuite :** dépôt → dossier `articles` → **Add file → Upload files** →
glissez votre `.docx` → **Commit changes**. Le site se met à jour tout seul en une minute environ.

> Remarque : si le dossier `.github` est invisible sur votre ordinateur (fichiers cachés), créez à la main, dans GitHub,
> le fichier `.github/workflows/publier.yml` (« Add file → Create new file », tapez le chemin complet) et collez-y le contenu du fichier fourni.

**Nom de domaine personnalisé :** Settings → Pages → *Custom domain*, puis créez l'enregistrement DNS chez
votre registraire (un `CNAME` vers `<votre-compte>.github.io` pour un sous-domaine comme `www`).

### Précautions

* Avec l'offre gratuite de GitHub, Pages n'est disponible que pour les **dépôts publics** :
  vos fichiers Word déposés dans `articles` sont donc lisibles par tous. **Ne déposez jamais un brouillon
  confidentiel** dans le dépôt : gardez-le sur votre ordinateur jusqu'à publication.
* Limites de GitHub Pages : site de 1 Go au plus, 100 Go de trafic par mois (limite « souple »), usage commercial
  (boutique, paiement) interdit.

## 3. Voir le résultat sur son ordinateur (facultatif)

Il faut Python 3 et [Pandoc](https://pandoc.org/installing.html) :

```
python3 build.py
python3 -m http.server -d dist 8000      # puis ouvrez http://localhost:8000
```

## 4. Personnaliser

* `site.json` : titre, slogan, nom de l'auteur, mention de pied de page. Renseignez `"url"` si vous
  utilisez votre propre domaine (utile au flux RSS et au plan du site).
* `assets/style.css` : les couleurs sont les variables au début du fichier (`--bg`, `--ink`, `--accent`…).
* Le site suit automatiquement le mode sombre de l'appareil du lecteur et s'imprime proprement.

## 5. Propriété intellectuelle

* Vos articles vous appartiennent du seul fait de leur création (art. L. 111-1 du Code de la propriété
  intellectuelle). La mention de pied de page (« Tous droits réservés ») se règle dans `site.json`.
* La police **Lora** est distribuée sous licence SIL Open Font License 1.1 (texte dans `assets/fonts/Lora-OFL.txt`).
* Le code (`build.py`, `style.css`, `site.js`) a été écrit pour ce projet ; n'y ajoutez ni images, ni textes, ni
  logos appartenant à des tiers sans autorisation.
