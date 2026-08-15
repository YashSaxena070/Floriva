const fs = require('fs');
const path = require('path');
const plants = require('../assets/plants_dataset.json');

plants.forEach(p => {
  console.log(`ID: ${p.id} | Name: ${p.common_name}`);
  console.log(`  Image: ${p.image_url}`);
  console.log(`  Categories: ${JSON.stringify(p.categories)}`);
});
