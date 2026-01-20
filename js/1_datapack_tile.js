//First Tile
var datapack1 = [
  "https://modrinth.com/datapack/katters-structures\"><img src=\"uploads/ks.png"
, "https://modrinth.com/datapack/enchantments-encore\"><img src=\"uploads/ee.png"
, "https://modrinth.com/datapack/warping-wonders\"><img src=\"uploads/wawo.png"
, "https://modrinth.com/datapack/fabled-roots\"><img src=\"uploads/fabled_roots.png"
];
function getfirstDatapackTag() {
var img = '<a target=\"_blank\" href=\"';
var randomIndex = Math.floor(Math.random() * datapack1.length);
img += datapack1[randomIndex];
img += '\" class=\"img-fluid\" alt=\"Image\">';
return img;
};

document.write(getfirstDatapackTag());
