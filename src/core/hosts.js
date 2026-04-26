"use strict";

const IMAGE_HOSTS = [
  "imx.to",
  "imagebam.com",
  "pixhost.to",
  "imgbox.com",
  "vipr.im",
  "imagetwist.com",
  "postimg.cc",
  "postimg.org",
  "turboimagehost.com",
  "imgur.com",
  "fastpic.org",
  "imgxxt.in",
  "imgdrive.net",
  "pimpandhost.com",
  "imagevenue.com",
];

// Checked in order; first match wins.
const HOST_MAP = [
  ["imx.to", "extractImxTo"],
  ["imagebam.com", "extractImagebam"],
  ["pixhost.to", "extractPixhost"],
  ["vipr.im", "extractViprIm"],
  ["imagetwist.com", "extractImagetwist"],
  ["postimg.cc", "extractPostimg"],
  ["postimg.org", "extractPostimg"],
  ["imgbox.com", "extractImgbox"],
  ["turboimagehost.com", "extractTurboimagehost"],
  ["imgur.com", "extractImgur"],
  ["fastpic.org", "extractFastpic"],
  ["imgxxt.in", "extractImgxxt"],
  ["imgdrive.net", "extractImgdrive"],
  ["pimpandhost.com", "extractPimpandhost"],
  ["imagevenue.com", "extractImagevenue"],
];

module.exports = { IMAGE_HOSTS, HOST_MAP };
