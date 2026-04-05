import { useState, useEffect, useMemo } from "react";

const BANNER_ADS = [
  "caram3lnuke_valentines.png",
  "chromosundrift_emasc.png",
  "colinahscopy_tep.png",
  "darius_crashlog.png",
  "diabloproject_spacemax.png",
  "ellg_friend.gif",
  "friend.png",
  "hingles_joel.gif",
  "khlorghaal_doot.png",
  "modclonk_learnmandarin.png",
  "nichepenguin_bpm.gif",
  "nichepenguin_eviljoel.png",
  "octorinski_green.png",
  "tyumici_m388.png",
  "wyndupboy_man.png",
];

const BASE_PATH = "/react_dist/bannerads/";

export default function BannerAd() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * BANNER_ADS.length));

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => {
        let next: number;
        do {
          next = Math.floor(Math.random() * BANNER_ADS.length);
        } while (next === prev && BANNER_ADS.length > 1);
        return next;
      });
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const src = useMemo(() => BASE_PATH + BANNER_ADS[index], [index]);

  return (
    <div className="w-full flex justify-center mt-3">
      <img
        src={src}
        alt="banner ad"
        className="max-w-full h-auto rounded"
        style={{ objectFit: "contain", imageRendering: "pixelated" }}
        draggable={false}
      />
    </div>
  );
}

