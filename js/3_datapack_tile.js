//Third Tile
var datapack3 = [
  "https://modrinth.com/datapack/nice-mob-manager\"><img src=\"uploads/mob_manager.png"
, "https://modrinth.com/datapack/nice-actions\"><img src=\"uploads/actions.png"
, "https://modrinth.com/datapack/nice-admin-tools\"><img src=\"uploads/nat.png"
];
function getthirdDatapackTag() {
var img = '<a target=\"_blank\" href=\"';
var randomIndex = Math.floor(Math.random() * datapack3.length);
img += datapack3[randomIndex];
img += '\" class=\"img-fluid\" alt=\"Image\">';
return img;
};

document.write(getthirdDatapackTag());