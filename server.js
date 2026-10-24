const KEY = (process.env.MAGIC_HOUR_API_KEY || "").trim().replace(/["']/g, "");
console.log("Clé lue :", KEY.slice(0, 9), "longueur", KEY.length);
