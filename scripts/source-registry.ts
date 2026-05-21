import { sourceRegistrySchema, type SourceRegistryEntry } from "../src/lib/legal/types";

export const sourceRegistry = sourceRegistrySchema.parse([
  {
    id: "constitution-2016",
    title: "Loi Portant Constitution de la République de Côte d’Ivoire, 2016",
    htmlUrl: "https://civlii.laws.africa/fr/akn/ci/act/2016/886/fra%402023-10-24",
    pdfUrl:
      "https://civlii.laws.africa/fr/akn/ci/act/2016/886/fra%402023-10-24/source.pdf",
    sourceRank: 2,
    lawNumber: "886/2016",
    documentType: "constitution",
    publicationDate: null,
    focusTags: [
      "droits fondamentaux",
      "arrestation",
      "garde a vue",
      "domicile",
      "dignite",
    ],
  },
  {
    id: "code-procedure-penale-2018",
    title: "Loi Portant Code de Procédure Pénale, 2018",
    htmlUrl: "https://civlii.laws.africa/fr/akn/ci/act/2018/975/fra%402024-06-23",
    pdfUrl:
      "https://civlii.laws.africa/fr/akn/ci/act/2018/975/fra%402024-06-23/source.pdf",
    sourceRank: 2,
    lawNumber: "975/2018",
    documentType: "code",
    publicationDate: null,
    focusTags: [
      "police judiciaire",
      "controle",
      "interpellation",
      "garde a vue",
      "perquisition",
      "droits de la defense",
    ],
  },
  {
    id: "carte-identite-2019",
    title: "Loi Instituant une Carte Nationale d’Identité, 2019",
    htmlUrl: "https://civlii.laws.africa/fr/akn/ci/act/2019/566",
    pdfUrl: "https://civlii.laws.africa/fr/akn/ci/act/2019/566/source.pdf",
    sourceRank: 2,
    lawNumber: "566/2019",
    documentType: "law",
    publicationDate: null,
    focusTags: ["identite", "carte nationale", "controle d'identite"],
  },
  {
    id: "perquisitions-criminalite-1996",
    title: "Loi Relative aux Perquisitions en Matière de Lutte Contre la Criminalité, 1996",
    htmlUrl: "https://civlii.laws.africa/fr/akn/ci/act/1996/765",
    pdfUrl: "https://civlii.laws.africa/fr/akn/ci/act/1996/765/source.pdf",
    sourceRank: 2,
    lawNumber: "765/1996",
    documentType: "law",
    publicationDate: null,
    focusTags: ["perquisition", "domicile", "criminalite"],
  },
  {
    id: "usage-voies-routieres-2016",
    title:
      "Décret Portant Règlementation de l’Usage des Voies Routières Ouvertes à la Circulation Publique, 2016",
    htmlUrl: "https://civlii.laws.africa/fr/akn/ci/act/decree/2016/864",
    pdfUrl:
      "https://civlii.laws.africa/fr/akn/ci/act/decree/2016/864/source.pdf",
    sourceRank: 2,
    lawNumber: "864/2016",
    documentType: "decree",
    publicationDate: null,
    focusTags: [
      "circulation routiere",
      "vehicule",
      "permis",
      "controle routier",
    ],
  },
] satisfies SourceRegistryEntry[]);
