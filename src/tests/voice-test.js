import googleTTS from "google-tts-api";
import { spawn } from "node:child_process";

function speak(text) {

  const url =
    googleTTS.getAudioUrl(
      text,
      {
        lang: "fr",
        slow: false,
        host: "https://translate.google.com",
        ttspeed: 1.5,
      }
    );

  console.log(
    "[TTS URL]",
    url
  );


  const player =
    spawn(
      "ffplay",
      [
        "-nodisp",
        "-autoexit",
        "-loglevel",
        "error",

        "-af",
        "atempo=1.2",

        url,
      ],
      {
        stdio: "inherit",
      }
    );


  player.on(
    "error",
    error => {

      console.error(
        "Erreur lancement ffplay :",
        error
      );

    }
  );


  player.on(
    "close",
    code => {

      console.log(
        "ffplay terminé avec code :",
        code
      );

    }
  );
}


speak(
  "Bonjour Samuel. Je suis Nexus. Ceci est un test de synthèse vocale."
);