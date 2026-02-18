//Second Tile
var datapack2 = [
  "https://modrinth.com/datapack/nice-mob-variants\"><img src=\"uploads/mob_variants.png"  
, "https://modrinth.com/datapack/nice-keep-inventory\"><img src=\"uploads/keepinv.png"
, "https://modrinth.com/datapack/nice-things-eden\"><img src=\"uploads/nice_things.png"
, "https://modrinth.com/datapack/nice-name-tags\"><img src=\"uploads/nnt.png"
];
function getsecondDatapackTag() {
var img = '<a target=\"_blank\" href=\"';
var randomIndex = Math.floor(Math.random() * datapack2.length);
img += datapack2[randomIndex];
img += '\" class=\"img-fluid\" alt=\"Image\">';
return img;
};

document.write(getsecondDatapackTag());