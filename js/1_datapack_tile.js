//First Tile
var datapack1 = [
  "https://modrinth.com/datapack/katters-structures\"><img src=\"uploads/ks.png"
, "https://modrinth.com/datapack/enchantments-encore\"><img src=\"uploads/ee.png"
, "https://modrinth.com/datapack/warping-wonders\"><img src=\"uploads/wawo.png"
, "https://modrinth.com/datapack/nice-mob-manager\"><img src=\"uploads/mob_manager.png"
, "https://modrinth.com/datapack/nice-actions\"><img src=\"uploads/actions.png"
, "https://modrinth.com/datapack/automaticons\"><img src=\"uploads/am.png"
, "https://modrinth.com/datapack/nice-mobs\"><img src=\"uploads/nice_mobs.png"
, "https://modrinth.com/datapack/fabled-roots\"><img src=\"uploads/fabled_roots.png"
, "https://modrinth.com/datapack/nice-things-eden\"><img src=\"uploads/nice_things.png"
];
function getfirstDatapackTag() {
var img = '<a target=\"_blank\" href=\"';
var randomIndex = Math.floor(Math.random() * datapack1.length);
img += datapack1[randomIndex];
img += '\" class=\"img-fluid\" alt=\"Image\">';
return img;
};

document.write(getfirstDatapackTag());
