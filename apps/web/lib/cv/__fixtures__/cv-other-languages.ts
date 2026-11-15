/**
 * Non-Swedish CVs whose parse must stay byte-identical to main 8f13c5d0
 * (before the Swedish lexicon was added). Review #3389 P2-1: a Swedish needle
 * must never change how another language's CV is read. The expected outputs
 * live in cv-other-languages.expected.json, generated from main's parser.
 */
export const OTHER_LANGUAGE_CVS: Readonly<Record<string, string>> = {
  lithuanian: `
Vardenis Pavardenis

Darbo patirtis
UAB Statyba — mūrininkas 2019–2022
MB Renovacija, pagalbinis darbininkas 2017–2019
UAB Testas — vairuotojas 2021–dabar

Išsilavinimas
Vilniaus statybininkų rengimo centras, profesinis mokymas 2015–2017

Kalbos
Anglų B1
Rusų gimtoji

Sertifikatai
Aukštalipio pažymėjimas 2020

Atlyginimo lūkestis: 2500–3000 € per mėnesį
Galiu dirbti savaitgaliais.
`,
  english: `
John Smith
London, United Kingdom

Work experience
Acme Ltd — warehouse operative 2018 to 2021
Builders Inc., site labourer 2021 – present

Education
Leeds College of Building, vocational course 2014–2016

Languages
English native
Polish B1
Swedish A2

Certificates
Forklift licence 2019

Salary expectation: 2200–2600 € per month
Willing to relocate. Own car. Night shift and weekend work OK.
`,
  russian: `
Иван Петров
Рига, Латвия

Опыт работы
ООО Строй — сварщик 2016–2020
SIA Metāls, сварщик 2020 – настоящее время

Образование
Рижский техникум, сварка 2012–2015

Языки
Русский родной
Английский B1
Латышский A2

Сертификаты
Сертификат сварщика 2018

Зарплата: 1800–2200 € в месяц
Готов переехать. Ночные смены.
`,
  german: `
Max Mustermann
Berlin, Deutschland

Berufserfahrung
Bau GmbH — Maurer 2015 bis 2019
Helger Bau GmbH, Polier 2019 – heute

Ausbildung
Berufsschule Berlin, Maurer 2012–2015

Sprachen
Deutsch Muttersprache
Englisch B2
Polnisch A1

Zertifikate
Zertifikat Gerüstbau 2017

Gehalt: 3000–3500 € pro Monat
Umzugsbereit. Eigenes Auto. Wochenende möglich.
`,
  dutch: `
Jan de Vries
Utrecht, Nederland

Werkervaring
Bouw B.V. — timmerman 2017 tot 2020
Montage B.V., monteur 2020 – heden

Opleiding
ROC Utrecht, opleiding timmerman 2013–2016

Talen
Nederlands moedertaal
Engels B2
Duits vloeiend

Certificaten
VCA certificaat 2018

Salaris: 2800–3200 € per maand
Bereid te verhuizen. Eigen auto. Nachtdienst geen probleem.
`,
  polish: `
Jan Kowalski
ul. Długa 5, 30-001 Kraków, Polska

Doświadczenie zawodowe
Budimex Polska Sp. z o.o. — spawacz 2015–2019
Stal Sp. z o.o., spawacz 2019–2023

Wykształcenie
Technikum Mechaniczne w Krakowie 2010–2014

Języki
Polski C2
Angielski B1

Certyfikaty
Certyfikat spawalniczy 2016
`,
};
