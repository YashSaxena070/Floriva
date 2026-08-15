const plantsData = require('../assets/plants_dataset.json');
console.log('Sample images from plants_dataset.json:');
plantsData.slice(0, 5).forEach(p => {
  console.log(`- ${p.common_name}: ${p.image_url}`);
});
