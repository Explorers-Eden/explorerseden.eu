//Second Tile
var datapack2 = [
  "https://modrinth.com/datapack/nice-mob-variants\"><img src=\"uploads/mob_variants.png"  
, "https://modrinth.com/datapack/nice-keep-inventory\"><img src=\"uploads/keepinv.png"
, "https://modrinth.com/datapack/nice-admin-tools\"><img src=\"uploads/nat.png"
, "https://modrinth.com/datapack/nice-name-tags\"><img src=\"uploads/nnt.png"
, "https://modrinth.com/datapack/nice-villager-master-trades\"><img src=\"uploads/master_trades.png"
];
function getsecondDatapackTag() {
var img = '<a target=\"_blank\" href=\"';
var randomIndex = Math.floor(Math.random() * datapack2.length);
img += datapack2[randomIndex];
img += '\" class=\"img-fluid\" alt=\"Image\">';
return img;
};

document.write(getsecondDatapackTag());