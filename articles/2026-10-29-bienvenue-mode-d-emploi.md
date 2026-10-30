---
titre: "Bienvenue : comment publier un article"
chapo: "Un article d’exemple, à supprimer dès que vous avez compris le principe."
date: 2026-10-29
vignette: images/abstrait.png
---

Ce site fonctionne sans outil compliqué : chaque article est un simple fichier texte, et une liste (le fichier `articles.json`) dit au site quels articles afficher et dans quel ordre.

## Ajouter un article, pas à pas

La page `ajouter.html` de votre site vous guide. Vous y saisissez le titre, la date et le texte, ou vous collez directement votre texte depuis Word. L’outil prépare alors les deux éléments à enregistrer sur GitHub[^1] : le fichier de l’article et la nouvelle liste des articles.

> Un texte se laisse lire lentement ou pas du tout.

## Le texte en Markdown

Le Markdown est une manière simple de mettre en forme un texte brut. Les intertitres commencent par `##`, le **gras** s’écrit entre deux étoiles doubles, l’*italique* entre deux étoiles simples, et un [lien](https://pandoc.org) entre crochets suivis de l’adresse entre parenthèses.

- une liste commence par un tiret ;
- chaque élément tient sur une ligne ;
- les listes numérotées commencent par « 1. ».

## Images

Déposez l’image dans le dossier `images` du dépôt, puis écrivez son chemin dans le texte :

![Composition abstraite, dans des tons de sable et de terre cuite.](images/abstrait.png "Une image d’exemple, avec sa légende.")

Les espaces avant les signes doubles sont corrigées automatiquement : « ainsi », sans que vous ayez à y penser ; surprenant, non ?[^2]

[^1]: Pour valider un fichier, GitHub propose le bouton « Commit changes » : il enregistre votre modification et déclenche la mise à jour du site.
[^2]: Les notes de bas de page se placent en fin de document, numérotées automatiquement, avec un lien de retour vers le texte.
