//Second Tile
var datapack2 = [

  "https://modrinth.com/datapack/nice-mobs-remastered\"><img src=\"uploads/nmr.png"
, "https://modrinth.com/datapack/nice-villagers-remastered\"><img src=\"uploads/nvr.png"
, "https://modrinth.com/datapack/nice-keep-inventory\"><img src=\"uploads/keepinv.png"
, "https://modrinth.com/datapack/astral-plane-dimension\"><img src=\"uploads/astral_plane.png"
, "https://modrinth.com/datapack/nice-villager-master-trades\"><img src=\"uploads/master_trades.png"
, "https://modrinth.com/datapack/villager-type-changer\"><img src=\"uploads/type_changer.png"
];
function getsecondDatapackTag() {
var img = '<a target=\"_blank\" href=\"';
var randomIndex = Math.floor(Math.random() * datapack2.length);
img += datapack2[randomIndex];
img += '\" class=\"img-fluid\" alt=\"Image\">';
return img;
};

document.write(getsecondDatapackTag());