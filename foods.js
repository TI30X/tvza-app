// TVZA Nährwertdatenbank — Werte pro 100 g (ungefähre Durchschnittswerte)
export const FOODS = [
  { name: "Haferflocken", kcal: 372, protein: 13.5, carbs: 58.7, fat: 7.0, fibre: 10.0, micros: ["Eisen","Magnesium","B1"] },
  { name: "Müsli (ungesüsst)", kcal: 355, protein: 10.0, carbs: 60.0, fat: 6.5, fibre: 8.0, micros: ["Eisen","Magnesium"] },
  { name: "Knuspermüsli", kcal: 450, protein: 8.5, carbs: 62.0, fat: 17.0, fibre: 6.0, micros: ["Eisen"] },
  { name: "Cornflakes", kcal: 378, protein: 7.0, carbs: 84.0, fat: 0.9, fibre: 3.0, micros: ["Eisen","B-Vitamine"] },
  { name: "Brot (dunkel)", kcal: 230, protein: 7.5, carbs: 43.0, fat: 1.5, fibre: 7.0, micros: ["Eisen","Magnesium","B1"] },
  { name: "Brot (hell)", kcal: 265, protein: 8.5, carbs: 51.0, fat: 2.0, fibre: 3.0, micros: ["B1"] },
  { name: "Vollkornbrot", kcal: 215, protein: 8.0, carbs: 38.0, fat: 1.8, fibre: 8.5, micros: ["Eisen","Magnesium","Zink"] },
  { name: "Zopf", kcal: 330, protein: 8.5, carbs: 52.0, fat: 9.5, fibre: 2.0, micros: ["B1"] },
  { name: "Gipfeli / Croissant", kcal: 400, protein: 8.0, carbs: 42.0, fat: 22.0, fibre: 2.5, micros: [] },
  { name: "Brötli / Semmel", kcal: 270, protein: 9.0, carbs: 52.0, fat: 2.0, fibre: 3.0, micros: ["B1"] },
  { name: "Knäckebrot", kcal: 350, protein: 10.0, carbs: 67.0, fat: 1.5, fibre: 15.0, micros: ["Eisen","Magnesium"] },
  { name: "Zwieback", kcal: 390, protein: 10.0, carbs: 73.0, fat: 5.0, fibre: 4.0, micros: [] },
  { name: "Reis (gekocht)", kcal: 130, protein: 2.5, carbs: 28.0, fat: 0.3, fibre: 0.5, micros: [] },
  { name: "Vollkornreis (gekocht)", kcal: 125, protein: 2.7, carbs: 25.0, fat: 1.0, fibre: 2.0, micros: ["Magnesium"] },
  { name: "Pasta / Teigwaren (gekocht)", kcal: 155, protein: 5.5, carbs: 30.0, fat: 1.0, fibre: 2.0, micros: [] },
  { name: "Vollkornpasta (gekocht)", kcal: 145, protein: 6.0, carbs: 27.0, fat: 1.3, fibre: 4.5, micros: ["Magnesium"] },
  { name: "Kartoffeln (gekocht)", kcal: 85, protein: 2.0, carbs: 18.5, fat: 0.1, fibre: 1.8, micros: ["Vitamin C","Kalium"] },
  { name: "Pommes Frites", kcal: 310, protein: 3.5, carbs: 40.0, fat: 15.0, fibre: 3.5, micros: ["Kalium"] },
  { name: "Rösti", kcal: 160, protein: 2.5, carbs: 22.0, fat: 7.0, fibre: 2.0, micros: ["Kalium"] },
  { name: "Couscous (gekocht)", kcal: 115, protein: 4.0, carbs: 23.0, fat: 0.2, fibre: 1.5, micros: [] },
  { name: "Quinoa (gekocht)", kcal: 120, protein: 4.5, carbs: 21.0, fat: 2.0, fibre: 2.8, micros: ["Eisen","Magnesium"] },
  { name: "Polenta (gekocht)", kcal: 85, protein: 2.0, carbs: 18.0, fat: 0.5, fibre: 1.0, micros: [] },
  { name: "Kartoffelstock / Püree", kcal: 105, protein: 2.0, carbs: 16.0, fat: 3.5, fibre: 1.5, micros: ["Kalium"] },
  { name: "Spätzli", kcal: 170, protein: 6.5, carbs: 30.0, fat: 3.0, fibre: 1.5, micros: [] },
  { name: "Vollmilch", kcal: 65, protein: 3.3, carbs: 4.8, fat: 3.6, fibre: 0, micros: ["Calcium","B12","Vitamin D"] },
  { name: "Milchdrink (2.5%)", kcal: 50, protein: 3.4, carbs: 4.9, fat: 2.5, fibre: 0, micros: ["Calcium","B12"] },
  { name: "Magermilch", kcal: 35, protein: 3.5, carbs: 5.0, fat: 0.1, fibre: 0, micros: ["Calcium","B12"] },
  { name: "Hafermilch", kcal: 45, protein: 1.0, carbs: 7.0, fat: 1.5, fibre: 0.8, micros: ["Calcium (angereichert)"] },
  { name: "Sojamilch", kcal: 40, protein: 3.5, carbs: 2.5, fat: 1.8, fibre: 0.5, micros: ["Calcium (angereichert)"] },
  { name: "Naturjoghurt", kcal: 60, protein: 4.5, carbs: 5.0, fat: 3.5, fibre: 0, micros: ["Calcium","B12"] },
  { name: "Griechisches Joghurt", kcal: 100, protein: 7.0, carbs: 4.0, fat: 6.0, fibre: 0, micros: ["Calcium","B12"] },
  { name: "Fruchtjoghurt", kcal: 95, protein: 3.5, carbs: 14.0, fat: 2.8, fibre: 0.2, micros: ["Calcium"] },
  { name: "Magerquark", kcal: 65, protein: 12.0, carbs: 4.0, fat: 0.2, fibre: 0, micros: ["Calcium","B12"] },
  { name: "Hüttenkäse", kcal: 100, protein: 12.5, carbs: 2.5, fat: 4.5, fibre: 0, micros: ["Calcium","B12"] },
  { name: "Käse (Hartkäse, z.B. Gruyère)", kcal: 400, protein: 28.0, carbs: 0.5, fat: 32.0, fibre: 0, micros: ["Calcium","B12","Vitamin D"] },
  { name: "Käse (Weichkäse, z.B. Brie)", kcal: 330, protein: 20.0, carbs: 0.5, fat: 28.0, fibre: 0, micros: ["Calcium","B12"] },
  { name: "Mozzarella", kcal: 250, protein: 18.0, carbs: 1.5, fat: 19.0, fibre: 0, micros: ["Calcium","B12"] },
  { name: "Raclettekäse", kcal: 360, protein: 24.0, carbs: 0.5, fat: 29.0, fibre: 0, micros: ["Calcium","B12"] },
  { name: "Frischkäse", kcal: 250, protein: 6.0, carbs: 3.5, fat: 23.0, fibre: 0, micros: ["Calcium"] },
  { name: "Butter", kcal: 740, protein: 0.7, carbs: 0.6, fat: 82.0, fibre: 0, micros: ["Vitamin D","Vitamin A"] },
  { name: "Margarine", kcal: 720, protein: 0.2, carbs: 0.5, fat: 80.0, fibre: 0, micros: ["Vitamin D (angereichert)"] },
  { name: "Rahm / Sahne", kcal: 300, protein: 2.3, carbs: 3.2, fat: 31.0, fibre: 0, micros: ["Calcium"] },
  { name: "Ei (gekocht)", kcal: 155, protein: 13.0, carbs: 1.1, fat: 11.0, fibre: 0, micros: ["B12","Vitamin D","Eisen"] },
  { name: "Spiegelei", kcal: 195, protein: 13.5, carbs: 0.8, fat: 15.0, fibre: 0, micros: ["B12","Vitamin D","Eisen"] },
  { name: "Rührei", kcal: 150, protein: 11.0, carbs: 1.5, fat: 11.0, fibre: 0, micros: ["B12","Vitamin D"] },
  { name: "Pouletbrust", kcal: 110, protein: 23.0, carbs: 0, fat: 2.0, fibre: 0, micros: ["B12","Zink"] },
  { name: "Pouletschenkel", kcal: 180, protein: 18.0, carbs: 0, fat: 12.0, fibre: 0, micros: ["B12","Zink","Eisen"] },
  { name: "Rindfleisch (mager)", kcal: 150, protein: 22.0, carbs: 0, fat: 7.0, fibre: 0, micros: ["Eisen","B12","Zink"] },
  { name: "Rindshackfleisch", kcal: 240, protein: 18.5, carbs: 0, fat: 18.0, fibre: 0, micros: ["Eisen","B12","Zink"] },
  { name: "Schweinefleisch", kcal: 200, protein: 20.0, carbs: 0, fat: 13.0, fibre: 0, micros: ["B1","B12","Zink"] },
  { name: "Kalbfleisch", kcal: 110, protein: 21.0, carbs: 0, fat: 3.0, fibre: 0, micros: ["B12","Zink"] },
  { name: "Lammfleisch", kcal: 230, protein: 17.0, carbs: 0, fat: 18.0, fibre: 0, micros: ["Eisen","B12","Zink"] },
  { name: "Schinken", kcal: 110, protein: 18.0, carbs: 1.0, fat: 4.0, fibre: 0, micros: ["B12","B1"] },
  { name: "Salami", kcal: 380, protein: 22.0, carbs: 1.0, fat: 32.0, fibre: 0, micros: ["B12"] },
  { name: "Cervelat", kcal: 250, protein: 12.5, carbs: 1.0, fat: 22.0, fibre: 0, micros: ["B12"] },
  { name: "Bratwurst", kcal: 290, protein: 13.0, carbs: 1.0, fat: 26.0, fibre: 0, micros: ["B12"] },
  { name: "Wienerli", kcal: 270, protein: 11.5, carbs: 1.5, fat: 24.0, fibre: 0, micros: ["B12"] },
  { name: "Speck", kcal: 420, protein: 15.0, carbs: 0.5, fat: 40.0, fibre: 0, micros: ["B12","B1"] },
  { name: "Trockenfleisch (Bündnerfleisch)", kcal: 185, protein: 38.0, carbs: 0.5, fat: 3.0, fibre: 0, micros: ["Eisen","B12","Zink"] },
  { name: "Lachs", kcal: 200, protein: 20.0, carbs: 0, fat: 13.0, fibre: 0, micros: ["Vitamin D","B12","Omega-3"] },
  { name: "Thunfisch (Dose, Wasser)", kcal: 110, protein: 25.0, carbs: 0, fat: 1.0, fibre: 0, micros: ["B12","Vitamin D"] },
  { name: "Forelle", kcal: 120, protein: 20.0, carbs: 0, fat: 4.5, fibre: 0, micros: ["Vitamin D","B12"] },
  { name: "Fischstäbchen", kcal: 230, protein: 12.0, carbs: 18.0, fat: 12.0, fibre: 0.8, micros: ["B12"] },
  { name: "Crevetten", kcal: 85, protein: 18.5, carbs: 0.5, fat: 1.0, fibre: 0, micros: ["B12","Zink"] },
  { name: "Tofu", kcal: 125, protein: 12.0, carbs: 2.0, fat: 7.5, fibre: 1.5, micros: ["Calcium","Eisen"] },
  { name: "Quorn / Fleischersatz", kcal: 110, protein: 14.0, carbs: 4.5, fat: 3.0, fibre: 5.5, micros: ["Zink"] },
  { name: "Linsen (gekocht)", kcal: 115, protein: 9.0, carbs: 17.0, fat: 0.5, fibre: 8.0, micros: ["Eisen","Magnesium","Folat"] },
  { name: "Kichererbsen (gekocht)", kcal: 130, protein: 7.5, carbs: 18.0, fat: 2.5, fibre: 7.0, micros: ["Eisen","Magnesium","Folat"] },
  { name: "Bohnen weiss (gekocht)", kcal: 100, protein: 7.0, carbs: 14.0, fat: 0.5, fibre: 7.0, micros: ["Eisen","Magnesium"] },
  { name: "Hummus", kcal: 250, protein: 7.0, carbs: 14.0, fat: 17.0, fibre: 5.5, micros: ["Eisen","Magnesium"] },
  { name: "Apfel", kcal: 55, protein: 0.3, carbs: 12.0, fat: 0.2, fibre: 2.2, micros: ["Vitamin C"] },
  { name: "Banane", kcal: 90, protein: 1.1, carbs: 20.0, fat: 0.3, fibre: 2.5, micros: ["Kalium","B6"] },
  { name: "Orange", kcal: 47, protein: 0.9, carbs: 9.5, fat: 0.2, fibre: 2.0, micros: ["Vitamin C","Folat"] },
  { name: "Mandarine", kcal: 50, protein: 0.8, carbs: 10.5, fat: 0.2, fibre: 1.8, micros: ["Vitamin C"] },
  { name: "Blaubeeren / Heidelbeeren", kcal: 45, protein: 0.7, carbs: 9.0, fat: 0.4, fibre: 2.5, micros: ["Vitamin C","Vitamin K"] },
  { name: "Erdbeeren", kcal: 33, protein: 0.8, carbs: 6.0, fat: 0.3, fibre: 2.0, micros: ["Vitamin C","Folat"] },
  { name: "Himbeeren", kcal: 43, protein: 1.2, carbs: 5.5, fat: 0.6, fibre: 6.5, micros: ["Vitamin C"] },
  { name: "Trauben", kcal: 70, protein: 0.6, carbs: 16.0, fat: 0.2, fibre: 1.0, micros: ["Vitamin K"] },
  { name: "Birne", kcal: 58, protein: 0.4, carbs: 12.5, fat: 0.1, fibre: 3.0, micros: ["Vitamin C"] },
  { name: "Kiwi", kcal: 58, protein: 1.1, carbs: 11.0, fat: 0.5, fibre: 3.0, micros: ["Vitamin C","Vitamin K"] },
  { name: "Ananas", kcal: 50, protein: 0.5, carbs: 11.5, fat: 0.1, fibre: 1.5, micros: ["Vitamin C","Mangan"] },
  { name: "Mango", kcal: 62, protein: 0.8, carbs: 14.0, fat: 0.4, fibre: 1.8, micros: ["Vitamin C","Vitamin A"] },
  { name: "Wassermelone", kcal: 30, protein: 0.6, carbs: 7.0, fat: 0.2, fibre: 0.4, micros: ["Vitamin C"] },
  { name: "Pfirsich", kcal: 40, protein: 0.9, carbs: 8.5, fat: 0.2, fibre: 1.7, micros: ["Vitamin C"] },
  { name: "Aprikose", kcal: 45, protein: 1.0, carbs: 9.0, fat: 0.2, fibre: 2.0, micros: ["Vitamin A","Vitamin C"] },
  { name: "Zwetschgen / Pflaumen", kcal: 47, protein: 0.7, carbs: 10.5, fat: 0.2, fibre: 1.5, micros: ["Vitamin C"] },
  { name: "Kirschen", kcal: 60, protein: 1.0, carbs: 13.0, fat: 0.3, fibre: 1.8, micros: ["Vitamin C"] },
  { name: "Rosinen", kcal: 300, protein: 2.5, carbs: 72.0, fat: 0.5, fibre: 4.0, micros: ["Eisen","Kalium"] },
  { name: "Datteln", kcal: 280, protein: 2.0, carbs: 67.0, fat: 0.4, fibre: 7.0, micros: ["Kalium","Magnesium"] },
  { name: "Tomaten", kcal: 18, protein: 0.9, carbs: 2.7, fat: 0.2, fibre: 1.2, micros: ["Vitamin C","Kalium"] },
  { name: "Gurke", kcal: 13, protein: 0.6, carbs: 2.0, fat: 0.1, fibre: 0.6, micros: ["Vitamin K"] },
  { name: "Karotten / Rüebli", kcal: 36, protein: 0.9, carbs: 7.0, fat: 0.2, fibre: 2.8, micros: ["Vitamin A"] },
  { name: "Broccoli", kcal: 34, protein: 2.8, carbs: 4.0, fat: 0.4, fibre: 3.0, micros: ["Vitamin C","Vitamin K","Folat"] },
  { name: "Blumenkohl", kcal: 25, protein: 1.9, carbs: 3.0, fat: 0.3, fibre: 2.5, micros: ["Vitamin C","Vitamin K"] },
  { name: "Spinat", kcal: 23, protein: 2.9, carbs: 1.5, fat: 0.4, fibre: 2.2, micros: ["Eisen","Folat","Vitamin K"] },
  { name: "Zucchetti / Zucchini", kcal: 19, protein: 1.5, carbs: 2.0, fat: 0.3, fibre: 1.1, micros: ["Vitamin C"] },
  { name: "Peperoni / Paprika", kcal: 28, protein: 1.0, carbs: 5.0, fat: 0.3, fibre: 1.5, micros: ["Vitamin C","Vitamin A"] },
  { name: "Aubergine", kcal: 24, protein: 1.0, carbs: 3.5, fat: 0.2, fibre: 2.8, micros: [] },
  { name: "Pilze / Champignons", kcal: 22, protein: 3.0, carbs: 1.0, fat: 0.3, fibre: 2.0, micros: ["Vitamin D","B-Vitamine"] },
  { name: "Zwiebeln", kcal: 40, protein: 1.2, carbs: 8.0, fat: 0.1, fibre: 1.8, micros: ["Vitamin C"] },
  { name: "Knoblauch", kcal: 140, protein: 6.0, carbs: 28.0, fat: 0.5, fibre: 2.0, micros: ["Vitamin C","B6"] },
  { name: "Lauch", kcal: 30, protein: 2.0, carbs: 4.0, fat: 0.3, fibre: 2.3, micros: ["Vitamin K","Folat"] },
  { name: "Kopfsalat", kcal: 15, protein: 1.2, carbs: 1.5, fat: 0.2, fibre: 1.3, micros: ["Folat","Vitamin K"] },
  { name: "Rucola", kcal: 27, protein: 2.6, carbs: 2.0, fat: 0.7, fibre: 1.6, micros: ["Vitamin K","Folat","Calcium"] },
  { name: "Nüsslisalat / Feldsalat", kcal: 20, protein: 2.0, carbs: 1.5, fat: 0.4, fibre: 1.5, micros: ["Eisen","Folat","Vitamin C"] },
  { name: "Mais (Dose)", kcal: 80, protein: 2.8, carbs: 15.0, fat: 1.0, fibre: 2.5, micros: ["Folat"] },
  { name: "Erbsen", kcal: 80, protein: 5.5, carbs: 12.0, fat: 0.4, fibre: 5.0, micros: ["Vitamin C","Eisen","Folat"] },
  { name: "Bohnen grün", kcal: 30, protein: 1.9, carbs: 4.5, fat: 0.2, fibre: 3.0, micros: ["Vitamin K","Folat"] },
  { name: "Kürbis", kcal: 26, protein: 1.0, carbs: 5.5, fat: 0.1, fibre: 1.2, micros: ["Vitamin A"] },
  { name: "Süsskartoffel", kcal: 86, protein: 1.6, carbs: 20.0, fat: 0.1, fibre: 3.0, micros: ["Vitamin A","Kalium"] },
  { name: "Randen / Rote Beete", kcal: 43, protein: 1.6, carbs: 9.0, fat: 0.2, fibre: 2.5, micros: ["Folat","Eisen"] },
  { name: "Avocado", kcal: 160, protein: 2.0, carbs: 8.5, fat: 15.0, fibre: 6.7, micros: ["Kalium","Folat","Vitamin E"] },
  { name: "Oliven", kcal: 130, protein: 1.0, carbs: 3.5, fat: 12.5, fibre: 3.0, micros: ["Vitamin E","Eisen"] },
  { name: "Sauerkraut", kcal: 20, protein: 1.3, carbs: 3.0, fat: 0.2, fibre: 2.5, micros: ["Vitamin C"] },
  { name: "Mandeln", kcal: 600, protein: 21.0, carbs: 9.0, fat: 52.0, fibre: 12.0, micros: ["Vitamin E","Magnesium","Calcium"] },
  { name: "Baumnüsse / Walnüsse", kcal: 655, protein: 15.0, carbs: 11.0, fat: 62.0, fibre: 6.5, micros: ["Omega-3","Magnesium"] },
  { name: "Haselnüsse", kcal: 640, protein: 15.0, carbs: 11.0, fat: 61.0, fibre: 8.0, micros: ["Vitamin E","Magnesium"] },
  { name: "Cashewnüsse", kcal: 555, protein: 18.0, carbs: 30.0, fat: 44.0, fibre: 3.0, micros: ["Magnesium","Zink","Eisen"] },
  { name: "Erdnüsse", kcal: 570, protein: 26.0, carbs: 12.0, fat: 48.0, fibre: 8.5, micros: ["Magnesium","B3"] },
  { name: "Erdnussbutter", kcal: 590, protein: 25.0, carbs: 15.0, fat: 50.0, fibre: 6.0, micros: ["Magnesium","B3"] },
  { name: "Sonnenblumenkerne", kcal: 585, protein: 21.0, carbs: 17.0, fat: 51.0, fibre: 8.5, micros: ["Vitamin E","Magnesium"] },
  { name: "Kürbiskerne", kcal: 560, protein: 30.0, carbs: 11.0, fat: 49.0, fibre: 6.0, micros: ["Magnesium","Zink","Eisen"] },
  { name: "Leinsamen", kcal: 535, protein: 18.0, carbs: 29.0, fat: 42.0, fibre: 27.0, micros: ["Omega-3","Magnesium"] },
  { name: "Chiasamen", kcal: 485, protein: 17.0, carbs: 42.0, fat: 31.0, fibre: 34.0, micros: ["Omega-3","Calcium","Magnesium"] },
  { name: "Olivenöl", kcal: 885, protein: 0, carbs: 0, fat: 100.0, fibre: 0, micros: ["Vitamin E"] },
  { name: "Rapsöl", kcal: 885, protein: 0, carbs: 0, fat: 100.0, fibre: 0, micros: ["Vitamin E","Omega-3"] },
  { name: "Sonnenblumenöl", kcal: 885, protein: 0, carbs: 0, fat: 100.0, fibre: 0, micros: ["Vitamin E"] },
  { name: "Kokosöl", kcal: 890, protein: 0, carbs: 0, fat: 100.0, fibre: 0, micros: [] },
  { name: "Mayonnaise", kcal: 710, protein: 1.0, carbs: 2.5, fat: 77.0, fibre: 0, micros: ["Vitamin E"] },
  { name: "Ketchup", kcal: 100, protein: 1.2, carbs: 24.0, fat: 0.2, fibre: 0.5, micros: [] },
  { name: "Senf", kcal: 90, protein: 5.5, carbs: 6.0, fat: 4.5, fibre: 2.0, micros: [] },
  { name: "Sojasauce", kcal: 60, protein: 8.0, carbs: 6.0, fat: 0.1, fibre: 0.5, micros: [] },
  { name: "Tomatensauce", kcal: 50, protein: 1.5, carbs: 8.0, fat: 1.5, fibre: 1.5, micros: ["Vitamin C"] },
  { name: "Pesto", kcal: 450, protein: 5.0, carbs: 6.0, fat: 45.0, fibre: 2.0, micros: ["Vitamin E","Calcium"] },
  { name: "Bouillon (zubereitet)", kcal: 5, protein: 0.3, carbs: 0.5, fat: 0.2, fibre: 0, micros: [] },
  { name: "Honig", kcal: 305, protein: 0.3, carbs: 82.0, fat: 0, fibre: 0.2, micros: [] },
  { name: "Konfitüre / Marmelade", kcal: 250, protein: 0.4, carbs: 62.0, fat: 0.1, fibre: 1.0, micros: [] },
  { name: "Nutella / Brotaufstrich", kcal: 540, protein: 6.5, carbs: 57.0, fat: 31.0, fibre: 3.5, micros: [] },
  { name: "Zucker", kcal: 400, protein: 0, carbs: 100.0, fat: 0, fibre: 0, micros: [] },
  { name: "Schokolade (Milch)", kcal: 535, protein: 7.5, carbs: 57.0, fat: 30.0, fibre: 2.0, micros: ["Calcium","Eisen","Magnesium"] },
  { name: "Schokolade (dunkel, 70%)", kcal: 580, protein: 8.0, carbs: 34.0, fat: 43.0, fibre: 11.0, micros: ["Eisen","Magnesium","Zink"] },
  { name: "Gummibärchen", kcal: 340, protein: 7.0, carbs: 77.0, fat: 0.2, fibre: 0, micros: [] },
  { name: "Biskuits / Kekse", kcal: 480, protein: 6.0, carbs: 68.0, fat: 20.0, fibre: 2.0, micros: [] },
  { name: "Guetzli (Schoko)", kcal: 500, protein: 5.5, carbs: 64.0, fat: 24.0, fibre: 2.5, micros: [] },
  { name: "Kuchen (Rührkuchen)", kcal: 390, protein: 5.0, carbs: 50.0, fat: 18.0, fibre: 1.5, micros: [] },
  { name: "Apfelstrudel", kcal: 240, protein: 3.0, carbs: 35.0, fat: 9.5, fibre: 2.0, micros: ["Vitamin C"] },
  { name: "Glace / Eis (Vanille)", kcal: 200, protein: 3.5, carbs: 24.0, fat: 10.0, fibre: 0.3, micros: ["Calcium"] },
  { name: "Sorbet", kcal: 130, protein: 0.3, carbs: 32.0, fat: 0.2, fibre: 0.5, micros: ["Vitamin C"] },
  { name: "Pommes Chips", kcal: 540, protein: 6.5, carbs: 50.0, fat: 34.0, fibre: 4.0, micros: ["Kalium"] },
  { name: "Salzstangen / Bretzeli", kcal: 380, protein: 10.0, carbs: 77.0, fat: 3.5, fibre: 3.0, micros: [] },
  { name: "Popcorn (gesalzen)", kcal: 400, protein: 11.0, carbs: 55.0, fat: 14.0, fibre: 12.0, micros: ["Magnesium"] },
  { name: "Orangensaft", kcal: 45, protein: 0.7, carbs: 10.0, fat: 0.2, fibre: 0.2, micros: ["Vitamin C","Folat"] },
  { name: "Apfelsaft", kcal: 46, protein: 0.1, carbs: 11.0, fat: 0.1, fibre: 0.1, micros: [] },
  { name: "Multivitaminsaft", kcal: 50, protein: 0.4, carbs: 11.5, fat: 0.1, fibre: 0.3, micros: ["Vitamin C","Vitamin A"] },
  { name: "Cola", kcal: 42, protein: 0, carbs: 10.5, fat: 0, fibre: 0, micros: [] },
  { name: "Eistee", kcal: 30, protein: 0, carbs: 7.5, fat: 0, fibre: 0, micros: [] },
  { name: "Rivella", kcal: 37, protein: 0, carbs: 9.0, fat: 0, fibre: 0, micros: [] },
  { name: "Sirup (verdünnt)", kcal: 35, protein: 0, carbs: 9.0, fat: 0, fibre: 0, micros: [] },
  { name: "Kaffee (schwarz)", kcal: 2, protein: 0.2, carbs: 0, fat: 0, fibre: 0, micros: [] },
  { name: "Milchkaffee", kcal: 30, protein: 1.6, carbs: 2.5, fat: 1.6, fibre: 0, micros: ["Calcium"] },
  { name: "Cappuccino", kcal: 35, protein: 1.8, carbs: 3.0, fat: 1.8, fibre: 0, micros: ["Calcium"] },
  { name: "Tee (ungesüsst)", kcal: 1, protein: 0, carbs: 0.2, fat: 0, fibre: 0, micros: [] },
  { name: "Ovomaltine (zubereitet)", kcal: 80, protein: 3.0, carbs: 12.0, fat: 2.0, fibre: 0.5, micros: ["B-Vitamine","Calcium","Eisen"] },
  { name: "Kakao (zubereitet)", kcal: 85, protein: 3.5, carbs: 11.0, fat: 3.0, fibre: 0.8, micros: ["Calcium","Magnesium"] },
  { name: "Bier", kcal: 43, protein: 0.5, carbs: 3.5, fat: 0, fibre: 0, micros: [] },
  { name: "Wein (rot)", kcal: 83, protein: 0.1, carbs: 2.5, fat: 0, fibre: 0, micros: [] },
  { name: "Wein (weiss)", kcal: 80, protein: 0.1, carbs: 2.6, fat: 0, fibre: 0, micros: [] },
  { name: "Pizza Margherita", kcal: 240, protein: 10.0, carbs: 30.0, fat: 9.0, fibre: 2.0, micros: ["Calcium"] },
  { name: "Pizza Salami", kcal: 270, protein: 11.0, carbs: 28.0, fat: 13.0, fibre: 2.0, micros: ["Calcium","B12"] },
  { name: "Lasagne", kcal: 150, protein: 9.0, carbs: 13.0, fat: 7.0, fibre: 1.2, micros: ["Calcium","B12"] },
  { name: "Spaghetti Bolognese", kcal: 130, protein: 7.0, carbs: 16.0, fat: 4.5, fibre: 1.5, micros: ["Eisen","B12"] },
  { name: "Spaghetti Carbonara", kcal: 180, protein: 8.0, carbs: 18.0, fat: 8.5, fibre: 1.0, micros: ["Calcium","B12"] },
  { name: "Käsefondue", kcal: 330, protein: 17.0, carbs: 2.0, fat: 28.0, fibre: 0, micros: ["Calcium","B12"] },
  { name: "Raclette (mit Kartoffeln)", kcal: 200, protein: 10.0, carbs: 12.0, fat: 12.5, fibre: 1.0, micros: ["Calcium","B12"] },
  { name: "Älplermagronen", kcal: 180, protein: 7.0, carbs: 20.0, fat: 8.0, fibre: 1.2, micros: ["Calcium"] },
  { name: "Birchermüesli (zubereitet)", kcal: 110, protein: 3.5, carbs: 16.0, fat: 3.5, fibre: 2.0, micros: ["Vitamin C","Calcium"] },
  { name: "Sandwich (Schinken-Käse)", kcal: 250, protein: 12.0, carbs: 28.0, fat: 10.0, fibre: 1.8, micros: ["Calcium","B12"] },
  { name: "Döner Kebab", kcal: 215, protein: 12.0, carbs: 18.0, fat: 11.0, fibre: 1.5, micros: ["Eisen","B12"] },
  { name: "Burger (Cheeseburger)", kcal: 260, protein: 13.0, carbs: 25.0, fat: 12.5, fibre: 1.2, micros: ["B12","Eisen","Calcium"] },
  { name: "Sushi (gemischt)", kcal: 145, protein: 6.0, carbs: 28.0, fat: 1.0, fibre: 0.8, micros: ["B12","Jod"] },
  { name: "Frühlingsrolle", kcal: 170, protein: 4.5, carbs: 22.0, fat: 7.0, fibre: 2.0, micros: [] },
  { name: "Curry mit Reis", kcal: 140, protein: 5.0, carbs: 20.0, fat: 4.5, fibre: 1.5, micros: [] },
  { name: "Gemüsesuppe", kcal: 35, protein: 1.5, carbs: 5.0, fat: 1.0, fibre: 1.5, micros: ["Vitamin C"] },
  { name: "Tomatensuppe", kcal: 45, protein: 1.2, carbs: 7.0, fat: 1.5, fibre: 1.0, micros: ["Vitamin C"] },
  { name: "Kürbissuppe", kcal: 50, protein: 1.0, carbs: 7.5, fat: 1.8, fibre: 1.2, micros: ["Vitamin A"] },
  { name: "Protein-Shake (mit Milch)", kcal: 95, protein: 12.0, carbs: 6.0, fat: 2.5, fibre: 0.5, micros: ["Calcium","B12"] },
  { name: "Proteinriegel", kcal: 380, protein: 30.0, carbs: 35.0, fat: 12.0, fibre: 5.0, micros: ["Calcium","B-Vitamine"] },
  { name: "Müsliriegel", kcal: 420, protein: 6.5, carbs: 62.0, fat: 15.0, fibre: 5.0, micros: ["Eisen"] },
  { name: "Reiswaffeln", kcal: 385, protein: 8.0, carbs: 81.0, fat: 2.5, fibre: 3.0, micros: ["Magnesium"] },
  { name: "Darvida / Cracker", kcal: 420, protein: 11.0, carbs: 62.0, fat: 13.0, fibre: 8.0, micros: ["Eisen","Magnesium"] },
];

/* ── Dynamische Lebensmittel ───────────────────────
   Vom Admin freigegebene (Firestore `customFoods`) und
   frisch gescannte Produkte werden zur Laufzeit hier
   registriert. Sie verhalten sich wie die statischen
   Einträge oben (Suche, Treffer, Nährwerte).            */
export const EXTRA = [];

// Fügt Lebensmittel hinzu. Doppelte Namen werden übersprungen.
// `food` braucht mindestens { name, kcal } — fehlende Makros werden 0.
export function registerFoods(list) {
  for (const raw of (Array.isArray(list) ? list : [list])) {
    if (!raw || !raw.name) continue;
    const n = norm(raw.name);
    if (FOODS.some(f => norm(f.name) === n) || EXTRA.some(f => norm(f.name) === n)) continue;
    EXTRA.push({
      name: String(raw.name),
      kcal: +raw.kcal || 0,
      protein: +raw.protein || 0,
      carbs: +raw.carbs || 0,
      fat: +raw.fat || 0,
      fibre: +raw.fibre || 0,
      micros: Array.isArray(raw.micros) ? raw.micros : [],
      custom: true,
    });
  }
}

function allFoods() { return FOODS.concat(EXTRA); }

// Fuzzy search: substring + word-start matching, case/umlaut insensitive
export function searchFoods(query, limit = 8) {
  const q = norm(query);
  if (!q) return [];
  const scored = [];
  for (const f of allFoods()) {
    const n = norm(f.name);
    let score = -1;
    if (n.startsWith(q)) score = 0;
    else if (n.split(/[\s\/(),-]+/).some(w => w.startsWith(q))) score = 1;
    else if (n.includes(q)) score = 2;
    if (score >= 0) scored.push([score, f]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name));
  return scored.slice(0, limit).map(s => s[1]);
}

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/é|è|ê/g,'e');
}

export function findFood(name) {
  const n = norm(name);
  return allFoods().find(f => norm(f.name) === n) || null;
}

/* ── Portionen-Schätzung ────────────────────────────
   Liefert für ein Lebensmittel eine grobe „1 Portion"
   in Gramm + ein passendes Wort (Portion/Glas/Stück…).
   Damit kann man mit einem Tipp loggen, ohne zu wägen.  */
export function defaultServing(food) {
  const n = norm(food?.name || '');
  const has = (...ws) => ws.some(w => n.includes(norm(w)));

  // Fette & Öle — teelöffel-/esslöffelweise
  if (has('ol') && has('olivenol','rapsol','sonnenblumenol','kokosol','ol ')) return { grams: 12, label: '1 EL' };
  if (has('zucker'))                                                          return { grams: 8,  label: '1 TL' };
  // Schokolade zuerst (sonst greift unten „…milch…" als Getränk)
  if (has('schokolade'))                                                      return { grams: 30, label: '1 Portion' };
  if (has('butter','margarine'))                                             return { grams: 12, label: '1 Portion' };
  if (has('mayonnaise','pesto','ketchup','senf','sojasauce','tomatensauce','honig','konfit','marmelade','nutella','brotaufstrich','erdnussbutter','sirup','rahm','sahne'))
                                                                              return { grams: 20, label: '1 Portion' };

  // Getränke
  if (has('wein'))                                                            return { grams: 150, label: '1 Glas' };
  if (has('bier'))                                                            return { grams: 300, label: '1 Stange' };
  if (has('kaffee','cappuccino','espresso','tee ','tee('))                    return { grams: 150, label: '1 Tasse' };
  if (has('milch','saft','cola','eistee','rivella','shake','kakao','ovomaltine','drink','smoothie'))
                                                                              return { grams: 200, label: '1 Glas' };

  // Milchprodukte im Becher
  if (has('joghurt','quark','huttenkase','bircher'))                          return { grams: 180, label: '1 Becher' };
  if (has('kase','mozzarella','raclettekase','frischkase'))                   return { grams: 30,  label: '1 Portion' };

  // Eier
  if (has('ei (','spiegelei','ruhrei') || n === 'ei')                         return { grams: 55,  label: '1 Stück' };

  // Aufschnitt / Wurstwaren (dünn, als Belag)
  if (has('schinken','salami','speck','trockenfleisch','bundnerfleisch','cervelat'))
                                                                              return { grams: 30,  label: '1 Portion' };
  // Würste am Stück
  if (has('bratwurst','wienerli'))                                            return { grams: 120, label: '1 Stück' };

  // Fleisch & Fisch — Portion
  if (has('poulet','rind','schwein','kalb','lamm','fleisch','hackfleisch','lachs','thunfisch','forelle','crevetten','tofu','quorn','fischstab'))
                                                                              return { grams: 120, label: '1 Portion' };

  // Fertige Hauptgerichte (vor den Beilagen, damit „Spaghetti Bolognese" als Teller zählt)
  if (has('pizza','lasagne','bolognese','carbonara','burger','doner','sushi','curry','sandwich','fondue','raclette','fruhlingsrolle','alplermagronen'))
                                                                              return { grams: 300, label: '1 Portion' };

  // Sättigungsbeilagen (gekocht)
  if (has('reis','pasta','teigwaren','spaghetti','nudeln','kartoffel','couscous','quinoa','polenta','spatzli','rosti','pommes','puree','stock','magronen'))
                                                                              return { grams: 200, label: '1 Portion' };

  // Hülsenfrüchte (gekocht)
  if (has('linsen','kichererbsen','bohnen','hummus'))                         return { grams: 150, label: '1 Portion' };

  // Brot & Backwaren
  if (has('gipfeli','croissant','brotli','semmel','zopf'))                    return { grams: 60,  label: '1 Stück' };
  if (has('brot','knackebrot','zwieback','toast','cracker','darvida','reiswaffel'))
                                                                              return { grams: 40,  label: '1 Scheibe' };

  // Frühstücksflocken
  if (has('haferflocken','musli','cornflakes','knusper','flocken'))           return { grams: 50,  label: '1 Portion' };

  // Trockenfrüchte / Nüsse / Kerne / Samen
  if (has('rosinen','datteln'))                                               return { grams: 25,  label: '1 Handvoll' };
  if (has('mandeln','nusse','walnusse','haselnusse','cashew','erdnusse','kerne','samen','oliven'))
                                                                              return { grams: 25,  label: '1 Handvoll' };

  // Obst am Stück vs. Beeren
  if (has('apfel','banane','orange','mandarine','birne','kiwi','pfirsich','aprikose','zwetschg','pflaumen','mango'))
                                                                              return { grams: 120, label: '1 Stück' };
  if (has('beeren','erdbeeren','himbeeren','trauben','kirschen','ananas','wassermelone'))
                                                                              return { grams: 100, label: '1 Portion' };

  // Salate (leicht)
  if (has('salat','rucola','nusslisalat','feldsalat'))                        return { grams: 50,  label: '1 Portion' };

  // Suppen
  if (has('suppe','bouillon'))                                                return { grams: 250, label: '1 Teller' };

  // Süsses / Snacks / Desserts
  if (has('gummibarchen','biscuit','keks','guetzli','riegel','chips','bretzeli','popcorn','salzstangen'))
                                                                              return { grams: 30,  label: '1 Portion' };
  if (has('kuchen','strudel','glace','eis','sorbet'))                         return { grams: 90,  label: '1 Portion' };

  // Gemüse allgemein
  if (has('tomaten','gurke','karotten','ruebli','broccoli','blumenkohl','spinat','zucch','peperoni','paprika','aubergine','pilze','champignon','zwiebel','lauch','mais','erbsen','kurbis','suskartoffel','randen','sauerkraut'))
                                                                              return { grams: 150, label: '1 Portion' };

  // Fallback
  return { grams: 100, label: '100 g' };
}
