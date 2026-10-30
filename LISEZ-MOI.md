# La Légende — version simple (HTML, sans outil de construction)

Un site d'articles sobre, composé de simples fichiers. Il n'y a **rien à installer ni à compiler** :
`index.html` est déjà à la racine, GitHub n'a qu'à le publier.

> PHP ne peut pas être utilisé ici : GitHub Pages est un service d'hébergement de sites *statiques*
> ([GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)).
> Le site fonctionne donc en HTML, CSS et JavaScript.

```
index.html          page d'accueil (les derniers articles en haut)
article.html        page de lecture (affiche n'importe quel article)
ajouter.html        outil facultatif pour préparer un article en Markdown
reglages.json       réglages du site (titre, slogan, encadré du titre, pages)
articles/           VOS ARTICLES : un fichier Word (.docx) ou Markdown (.md) par article
pages/              pages fixes (« À propos »)
images/             vos images
outils/generer.py   le programme qui assemble le site (rien à y toucher)
.github/workflows/  la consigne qui lance ce programme automatiquement
```

## 1. Mettre le site en ligne (une seule fois)

1. Créez un compte sur github.com, puis un **nouveau dépôt** (« New repository »), en **public**.
2. Dans le dépôt : **Add file → Upload files**. Glissez le **contenu** du dossier (`index.html`, `reglages.json`, `articles`,
   `outils`…), pas le dossier lui-même, puis **Commit changes**
   ([documentation](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)).
   Limites : 100 fichiers par envoi, 25 Mio par fichier.
3. **Le dossier caché `.github`** est souvent ignoré par le glisser-déposer. Créez-le à la main :
   **Add file → Create new file**, tapez comme nom `.github/workflows/publier.yml` (les `/` créent les dossiers),
   collez-y le contenu du fichier `publier.yml` fourni, puis **Commit changes**
   ([documentation](https://docs.github.com/en/repositories/working-with-files/managing-files/creating-new-files)).
4. **Settings → Pages → Build and deployment → Source : « GitHub Actions »**
   ([documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)).
   Attention : ce n'est plus « Deploy from a branch ».
5. Onglet **Actions** : le « Publier le site » démarre à chaque dépôt (vous pouvez aussi le lancer avec **Run workflow**).
   Quand la pastille est verte (1 à 2 minutes), l'adresse du site s'affiche dans **Settings → Pages**.
   Une pastille rouge = une erreur : cliquez dessus, le message dit quel fichier pose problème.

## 2. Ajouter un article : un seul geste

**Avec Word (le plus simple).** Rédigez votre article dans Word, puis dans le dépôt : dossier `articles` →
**Add file → Upload files** → glissez le `.docx` → **Commit changes**. C'est terminé : environ deux minutes plus tard,
l'article est en tête de l'accueil, la liste est mise à jour par le programme.

Règles d'écriture dans Word :

| Dans Word | Sur le site |
|---|---|
| style **Titre** | titre de l'article |
| style **Sous-titre** | chapo (phrase d'accroche) |
| styles **Titre 1, 2, 3** | intertitres (I., A., 1.) |
| style **Citation** | bloc de citation |
| notes de bas de page | notes en fin d'article |
| images, listes, liens, tableaux simples, exposants | repris |

* **La date** se lit dans le nom du fichier : `2026-11-03-mon-article.docx`. Sans date dans le nom, c'est la date du dépôt.
* **La rubrique** : rangez le fichier dans un sous-dossier (`articles/Essais/2026-11-03-mon-article.docx`) ; le nom du
  sous-dossier devient la rubrique.
* **Brouillon** : un nom commençant par `_` (`_mon-brouillon.docx`) n'est jamais publié.
* **Modifier** : redéposez le fichier de même nom (ou modifiez le `.md`). **Supprimer** : supprimez le fichier.
* Conversion faite par [Pandoc](https://pandoc.org/MANUAL.html#option--shift-heading-level-by) ; la mise en page
  (alignement, polices, couleurs de Word) n'est volontairement pas reprise : tous les articles ont la même présentation.

**Avec un fichier Markdown (.md).** Mêmes gestes, avec un en-tête facultatif en haut du fichier :

```
---
titre: "Mon titre"
chapo: "Une phrase d'accroche."
date: 2026-11-03
rubrique: "Essais"
resume: "Texte affiché sur l'accueil (sinon : le premier paragraphe)."
vignette: images/photo.jpg
---

Le texte de l'article…
```

Tous les champs sont facultatifs. L'outil `ajouter.html` prépare ce fichier à partir d'un formulaire.

**Images.** Dans Word, insérez-les normalement. En Markdown, déposez-les d'abord dans `images`, puis écrivez
`![description](images/nom.jpg)`. La première image sert de vignette sur l'accueil.

### Syntaxe Markdown

| Pour obtenir | Écrire |
|---|---|
| intertitre | `## Mon intertitre` (et `### ` pour un sous-intertitre) |
| **gras** / *italique* | `**gras**` / `*italique*` |
| lien | `[texte](https://…)` |
| image avec légende | `![description](images/nom.jpg "Légende")` |
| citation | `> texte cité` |
| liste | `- élément` ou `1. élément` |
| note de bas de page | `[^1]` dans le texte, puis `[^1]: texte de la note` en fin de fichier |

Les espaces avant `: ; ! ?` et dans les guillemets « » sont corrigées automatiquement.

## 3. Réglages

Dans `reglages.json`, on trouve le titre, le slogan, le nom de l'auteur, la mention de pied de
page et les pages fixes (chaque page `xxx` correspond à un fichier `pages/xxx.md`).
Les couleurs se changent dans les variables au début de `assets/style.css`.

### Les petits plus du site

* **Encadré au survol du titre** (comme les aperçus de Wikipédia) : il s'ouvre quand on passe la souris sur « La Légende »,
  au clavier quand le titre a le focus, et sur écran tactile au premier appui (le second ouvre l'accueil).
  Son texte se modifie dans `reglages.json`, rubrique `"hovercard"` (`title`, `subtitle`, `text`, `link`).
  Le texte fourni est un brouillon : le dernier paragraphe (« Ce carnet en emprunte l'esprit… ») est à réécrire
  avec **vos** raisons. Supprimez la rubrique `"hovercard"` de `reglages.json` pour retirer l'encadré.
* **Logo** : trois barres qui se rejoignent en triangle au survol (fichier `assets/style.css`, section « Logo »).
  Le même dessin sert d'icône d'onglet (`assets/logo.svg`).
* **Au hasard** : l'onglet du menu ouvre un article tiré au sort, toujours différent de celui que l'on lit.
* **Réglages de lecture** (bouton « Aa » sur les pages d'article) : taille du texte en cinq crans — la colonne s'élargit
  avec le texte — et texte justifié ou non. Les choix sont mémorisés dans le navigateur du lecteur.
* **Justification et centrage des images** sont gérés par le site (feuille de style), pas par Word : l'alignement choisi
  dans Word n'est pas repris, c'est voulu, pour que tous les articles aient la même présentation.
  Une image est toujours centrée dans la colonne, quelle que soit sa taille.

## 4. À savoir

* **JavaScript requis** : les articles sont affichés par le navigateur. Conséquences : pas de flux RSS, et un
  référencement par les moteurs de recherche moins fiable qu'avec des pages générées à l'avance.
* **Le site se construit en ligne** : le dossier `_site` n'existe que chez GitHub. Pour tester sur votre ordinateur :
  `python3 outils/generer.py` (Pandoc requis pour le Word), puis `python3 -m http.server -d _site` et `http://localhost:8000`.
  Un double-clic sur `index.html` ne fonctionne pas : le navigateur interdit la lecture des articles.
* **Conversion Word** : testée ici sur des fichiers de démonstration (titres, notes, images, exposants, tableaux) avec
  Pandoc 3.1.3, mais pas encore sur vos propres documents ni sur la chaîne GitHub réelle. Relisez le premier article publié.
  Souligné et petites capitales ne sont pas conservés (rendus en italique et en majuscules). Un tableau très
  complexe (cellules fusionnées, listes dans une cellule) peut être simplifié.
* **Dépôt sans date** : la date du premier dépôt est utilisée ; elle est retrouvée par l'historique Git.
* **Dépôt public** : avec l'offre gratuite, GitHub Pages n'est disponible que pour les dépôts publics
  ([GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)) : tout ce que
  vous y déposez est lisible par tous, brouillons compris. Gardez vos brouillons sur votre ordinateur.
* **Nom de domaine personnalisé** : Settings → Pages → *Custom domain*, puis enregistrement DNS chez votre registraire
  ([GitHub Docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)).
* **Limites de GitHub Pages** : site de 1 Go au plus, 100 Go de trafic par mois (limite « souple »), usage commercial
  interdit ([GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)).
* `ajouter.html` n'est pas lié dans les menus mais reste accessible à qui connaît l'adresse ; il ne permet de rien
  publier, seulement de préparer du texte à copier.

## 5. Propriété intellectuelle

* Vos articles vous appartiennent du seul fait de leur création (art. L. 111-1 du Code de la propriété intellectuelle).
* Police **Lora** : licence SIL Open Font License 1.1 (`assets/fonts/Lora-OFL.txt`).
* Le code et les images d'exemple ont été créés pour ce projet ; n'y ajoutez pas d'éléments appartenant à des tiers
  sans autorisation.
