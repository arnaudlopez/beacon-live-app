const regex = /\{x:(\d{13}),\s*y:([\d.]+)[^}]*o:"([^"]*)"[^}]*min:"([\d.]*)"[^}]*max:"([\d.]*)"[^}]*\}/g;
const fs = require('fs');
fetch("https://www.winds-up.com/spot-porticcio--windsurf-kitesurf-1726-observations-releves-vent.html")
  .then(r => r.text())
  .then(html => {
    let m = regex.exec(html);
    console.log("FIRST MATCH:", m ? m[0] : "None");
    
    // check if it mentions knots or km/h
    console.log("Unit in HTML:", html.includes("noeuds") || html.includes("kt") ? "Knots" : "km/h");
  });
