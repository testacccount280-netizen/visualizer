// Сгенерировано из Skycoder (skycoder.ini, modes.inc, themes.inc). Размеры пунктира — в долях толщины линии.
export const RINGS = [{"r": 110.0, "w": 18.0, "dashes": [8.532721, 1.044823, 2.786195, 1.044823, 4.701703, 1.044823, 3.743949, 1.044823, 4.701703, 1.044823, 5.659458, 3.0474], "fill": false, "level": 0, "set": 0, "rot": {"drive": 0, "i": 32, "s": 900, "dir": 1}}, {"r": 134.0, "w": 18.0, "dashes": null, "fill": false, "level": 1, "set": 0, "rot": null}, {"r": 158.0, "w": 18.0, "dashes": [1.250621, 1.500746, 2.626305, 1.500746, 5.377672, 5.627796, 10.880406, 2.876429, 4.001989, 1.500746, 5.377672, 1.500746, 2.626305, 1.500746, 1.250621, 1.500746, 1.250621, 3.001491], "fill": false, "level": 2, "set": 0, "rot": {"drive": 1, "i": 20, "s": 1200, "dir": -1}}, {"r": 184.0, "w": 20.0, "dashes": [1.310778, 0.131078, 1.310778, 0.131078, 1.310778, 0.131078, 1.310778, 0.131078, 1.310778, 1.572933, 1.310778, 1.572933, 1.310778, 1.572933, 1.310778, 0.131078, 1.310778, 1.572933, 1.310778, 0.131078, 1.310778, 0.131078, 1.310778, 0.131078, 1.310778, 1.572933, 1.310778, 0.131078, 1.310778, 1.572933, 1.310778, 0.131078, 1.310778, 0.131078, 1.310778, 0.131078, 1.310778, 1.572933, 1.310778, 4.456645, 1.310778, 0.131078, 1.310778, 0.131078, 1.310778, 0.131078, 1.310778, 1.572933, 1.310778, 0.131078, 1.310778, 0.131078, 1.310778, 3.145867], "fill": false, "level": 3, "set": 0, "rot": {"drive": 3, "i": 16, "s": 1100, "dir": 1}}, {"r": 80.0, "w": 18.0, "dashes": [8.532721, 1.044823, 2.786195, 1.044823, 4.701703, 1.044823, 3.743949, 1.044823, 4.701703, 1.044823, 5.659458, 3.0474], "fill": false, "level": 0, "set": 1, "rot": {"drive": 0, "i": 32, "s": 900, "dir": 1}}, {"r": 40.0, "w": 18.0, "dashes": null, "fill": false, "level": 1, "set": 1, "rot": null}, {"r": 60.0, "w": 18.0, "dashes": [1.250621, 1.500746, 2.626305, 1.500746, 5.377672, 5.627796, 10.880406, 2.876429, 4.001989, 1.500746, 5.377672, 1.500746, 2.626305, 1.500746, 1.250621, 1.500746, 1.250621, 3.001491], "fill": false, "level": 2, "set": 1, "rot": {"drive": 1, "i": 20, "s": 1200, "dir": -1}}, {"r": 10.0, "w": 0, "dashes": null, "fill": true, "level": 3, "set": 1, "rot": null}];
export const MODES = [
 {
  "name": "Classic",
  "tip": "Default look: mids and upper mids drive the rings",
  "bands": [
   3,
   4,
   6,
   7
  ],
  "mult": 1.0,
  "att": 120.0,
  "dec": 80.0,
  "contrast": 1.2,
  "punch": 0.3
 },
 {
  "name": "Heavy bass",
  "tip": "For bass-rich music and good speakers: deep bass drives the rings",
  "bands": [
   0,
   1,
   2,
   3
  ],
  "mult": 1.2,
  "att": 60.0,
  "dec": 120.0,
  "contrast": 1.5,
  "punch": 0.6
 },
 {
  "name": "Light bass",
  "tip": "For weak bass (laptops, headphones): ignores empty deep bass, boosts low-mids",
  "bands": [
   2,
   4,
   5,
   6
  ],
  "mult": 1.5,
  "att": 120.0,
  "dec": 80.0,
  "contrast": 1.2,
  "punch": 0.4
 },
 {
  "name": "Treble",
  "tip": "Highs and hi-hats drive the rings",
  "bands": [
   6,
   7,
   8,
   9
  ],
  "mult": 1.6,
  "att": 80.0,
  "dec": 60.0,
  "contrast": 1.3,
  "punch": 0.5
 },
 {
  "name": "Spectrum",
  "tip": "Evenly spread across the whole spectrum",
  "bands": [
   1,
   3,
   5,
   7
  ],
  "mult": 1.0,
  "att": 100.0,
  "dec": 100.0,
  "contrast": 1.1,
  "punch": 0.2
 },
 {
  "name": "Calm",
  "tip": "Soft and smooth, slow reactions",
  "bands": [
   3,
   4,
   6,
   7
  ],
  "mult": 0.5,
  "att": 200.0,
  "dec": 250.0,
  "contrast": 0.9,
  "punch": 0.0
 },
 {
  "name": "Hyper",
  "tip": "Aggressive and snappy, strong reactions",
  "bands": [
   3,
   4,
   6,
   7
  ],
  "mult": 2.0,
  "att": 30.0,
  "dec": 60.0,
  "contrast": 1.6,
  "punch": 0.8
 },
 {
  "name": "Custom",
  "tip": "Your own template: edit Mode8* values in modes.inc",
  "bands": [
   2,
   3,
   5,
   8
  ],
  "mult": 1.0,
  "att": 34.0,
  "dec": 0.0,
  "contrast": 1.2,
  "punch": 0.76
 }
];
export const THEMES = [{"name": "Copper", "c": [190, 76, 76], "cb": [10, 76, 47]}, {"name": "Salad", "c": [190, 255, 0], "cb": [0, 70, 0]}, {"name": "Toxic", "c": [0, 255, 65], "cb": [0, 130, 0]}, {"name": "Abyss", "c": [0, 79, 97], "cb": [91, 16, 32]}, {"name": "upOne", "c": [140, 20, 255], "cb": [130, 50, 200]}, {"name": "Gold", "c": [255, 176, 0], "cb": [30, 30, 30]}, {"name": "D_ICE", "c": [120, 200, 255], "cb": [30, 70, 120]}, {"name": "hot_ice", "c": [255, 65, 0], "cb": [0, 190, 255]}];
