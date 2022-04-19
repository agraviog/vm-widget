var Webflow = Webflow || [];
Webflow.push(function () {
  const lottie = Webflow.require("lottie").lottie;
  const REQUEST_KEY = "voicemod_mic_request";
  const animations = lottie.getRegisteredAnimations();
  const API_URL = "https://staging-gateway-api.voicemod.net/v2/cloud";
  const X_KEY = "zqqztBHlkyIOAHMJgVaskJWrqO2ssXQo";
  const MOD_AUDIO = "control_upload_audio_transformed";
  const ORIG_AUDIO = "control_upload_audio_original";
  const SHARE_SNIPPET_URL = "https://voicemod-net.webflow.io/share-snippet";
  const MAX_GET_RETRIES = 10;
  function getShareData(url) {
    return {
      title: "Voicemod share snippet",
      text: "Listen to my voicemod!",
      url,
    };
  }

  const workerOptions = {
    OggOpusEncoderWasmPath:
      "https://cdn.jsdelivr.net/npm/opus-media-recorder@latest/OggOpusEncoder.wasm",
    WebMOpusEncoderWasmPath:
      "https://cdn.jsdelivr.net/npm/opus-media-recorder@latest/WebMOpusEncoder.wasm",
  };

  // ready | recording | loading | ready_to_play |  playing | paused | playing
  let state = "ready";
  let isTransformed = true;
  let chunks = [];
  let mediaRecorder = null;
  let recordInterval = 0;
  let recordIntervalId = null;
  let fetchInterval = null;
  let retryCount = 0;
  const convertedFiles = {
    baby: "",
    "magic-chords": "",
    cave: "",
    original: "",
  };

  const fetchIds = {
    baby: "",
    "magic-chords": "",
    cave: "",
  };

  const convertVoiceIds = ["baby", "magic-chords", "cave"];

  function getFileUrlOnActiveType() {
    const voiceId = $(".vm-widget--btns").attr("data-voiceid") || "baby";
    if (!!convertedFiles.original) {
      return convertedFiles[voiceId];
    }
    return null;
  }

  function toggleIcon() {
    state = "ready_to_play";
    $(".pause_icon--vm-widget").removeClass("played");
    $(".play_icon--vm-widget").addClass("paused");
  }

  function resetPlay() {
    const transformedEl = document.getElementById(MOD_AUDIO);
    const originalEl = document.getElementById(ORIG_AUDIO);
    if (transformedEl || originalEl) {
      transformedEl.currentTime = 0;
      transformedEl.pause();
      originalEl.pause();
      originalEl.currentTime = 0;
    }
  }

  function setFilesOnCorrectType() {
    setTimeout(() => {
      const voiceId = $(".vm-widget--btns").attr("data-voiceid") || "baby";
      const transformedUrl = convertedFiles[voiceId];

      if (transformedUrl) {
        setAudio(transformedUrl, MOD_AUDIO);
        resetPlay();
      }
      toggleIcon();
    }, 50);
  }

  function handlePlay() {
    const transformedEl = document.getElementById(MOD_AUDIO);
    const originalEl = document.getElementById(ORIG_AUDIO);

    if (isTransformed) {
      transformedEl.play();
      originalEl.pause();
    } else {
      originalEl.play();
      transformedEl.pause();
    }
  }

  function createUrlBasedOnFile(file) {
    const blob = window.URL || window.webkitURL;
    return blob.createObjectURL(file);
  }

  async function submitAudioData(formData) {
    const originalFile = formData.get("audioFile");
    const formDataWithNewVoiceIds = convertVoiceIds.map((voiceId) => {
      const data = new FormData();
      data.append("audioFile", originalFile);
      data.append("voice", voiceId);
      return data;
    });

    try {
      const URL = `${API_URL}/audio`;
      const results = await Promise.all(
        formDataWithNewVoiceIds.map((body) =>
          fetch(URL, {
            method: "POST",
            headers: {
              "x-api-key": X_KEY,
            },
            body,
          })
        )
      );

      if (results.some((res) => res.status !== 202)) {
        throw new Error("Fetch was not successful!");
      }

      let i = 0;
      for (const result of results) {
        const { id } = await result.json();
        fetchIds[convertVoiceIds[i]] = id;
        i += 1;
      }

      const originalFileUrl = createUrlBasedOnFile(originalFile);
      convertedFiles.original = originalFileUrl;

      return true;
    } catch (e) {
      return false;
    }
  }

  function secondsToMinutes(time) {
    return (
      Math.floor(time / 60) + ":" + ("0" + Math.floor(time % 60)).slice(-2)
    );
  }

  function setAudio(url, id) {
    let audioEl = document.getElementById(id);
    if (audioEl) {
      audioEl.src = url;
    } else {
      audioEl = document.createElement("audio");
      audioEl.id = id;
      audioEl.src = url;
      audioEl.preload = "metadata";
      audioEl.volume = 1;
      document.body.appendChild(audioEl);
      audioEl.onloadedmetadata = function () {
        $(".control_audio-time").text(secondsToMinutes(this.duration));
      };

      audioEl.onended = function () {
        toggleIcon();
      };
    }
  }

  function stopRecord() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  }

  $(`.play-pause--vm-widget`).on("click", function () {
    const transformedAudioElement = document.getElementById(MOD_AUDIO);
    const originalAudioElement = document.getElementById(ORIG_AUDIO);

    if (transformedAudioElement && originalAudioElement) {
      state = state === "playing" ? "paused" : "playing";
      if (state === "playing") {
        handlePlay(originalAudioElement, transformedAudioElement);
      } else {
        transformedAudioElement.pause();
        originalAudioElement.pause();
      }

      $(".pause_icon--vm-widget").toggleClass("played");
      $(".play_icon--vm-widget").toggleClass("paused");
    }
  });

  function showLoadingUI() {
    state = "loading";
    $(".record--vm-widget").css({ display: "none" });
    $(".loading_record--vm-widget").css({ display: "flex" });
    $(".recording-text").removeClass("active-text");
    $(".loading-text").addClass("active-text");
  }

  function showReadyToPlayUI() {
    state = "ready_to_play";
    $(".loading_record--vm-widget").css({ display: "none" });
    $(".play-pause--vm-widget").css({ display: "flex" });
    $(".vm-widget--btns-wrapper").css({ display: "flex" });
    $(".control_share--vm-widget").css({ display: "flex" });
    $(".loading-text").removeClass("active-text");
    $(".done-text").addClass("active-text");
  }

  function setMicrophoneLocalStorage() {
    localStorage.setItem(REQUEST_KEY, "true");
  }

  async function validateMicrophoneAccess() {
    // if has navigator.permissions, validate, else, trust localStorage
    if (navigator?.permissions) {
      try {
        const micQuery = await navigator?.permissions.query({
          name: "microphone",
        });
        if (micQuery.state === "granted") {
          setMicrophoneLocalStorage();
        }
      } catch (e) {
        console.log({ e });
      }
    }
  }

  async function startRecordProcess() {
    resetPlay();
    if (navigator.mediaDevices) {
      await validateMicrophoneAccess();
      try {
        const hasRequestedPermission = localStorage.getItem(REQUEST_KEY);
        if (["ready", "ready_to_play", "playing", "paused"].includes(state)) {
          const userMedia = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });

          mediaRecorder = new OpusMediaRecorder(
            userMedia,
            { mimeType: "audio/wav" },
            workerOptions
          );

          recordInterval = 0;
          if (mediaRecorder) {
            mediaRecorder.onstart = function () {
              state = "recording";
              animations[0].play();
              $(".start-text").removeClass("active-text");
              $(".recording-text").addClass("active-text");
              recordIntervalId = setInterval(() => {
                recordInterval += 1;
                if (recordInterval > 10) {
                  stopRecord();
                }
              }, 1000);
            };

            mediaRecorder.onstop = function () {
              showLoadingUI();
              userMedia.getTracks().forEach((track) => track.stop());
              animations[0].stop();
              clearInterval(recordIntervalId);
              recordIntervalId = null;
              initializeUpload();
            };

            mediaRecorder.ondataavailable = function (e) {
              chunks.push(e.data);
            };
            if (hasRequestedPermission) {
              mediaRecorder.start();
            } else {
              userMedia.getTracks().forEach((track) => track.stop());
            }
            setMicrophoneLocalStorage();
          }
        } else if (state === "recording") {
          mediaRecorder.stop();
        }
      } catch (e) {
        localStorage.removeItem(REQUEST_KEY);
      }
    }
  }

  $(".record--vm-widget").on("click", startRecordProcess);

  function clearFetchInterval() {
    clearInterval(fetchInterval);
    fetchInterval = null;
    retryCount = 0;
  }

  async function fetchAudioUrl() {
    fetchInterval = setInterval(async () => {
      if (retryCount > MAX_GET_RETRIES) {
        clearFetchInterval();
      }
      const results = await Promise.all(
        convertVoiceIds.map((voiceKey) =>
          fetch(`${API_URL}/audio/${fetchIds[voiceKey]}`, {
            headers: {
              "x-api-key": X_KEY,
            },
          })
        )
      );

      retryCount += 1;

      if (results.some((res) => [400, 500].includes(res.status))) {
        clearFetchInterval();
        throw new Error("Fetch was not successful!");
      }
      if (results.every((res) => res.status === 200)) {
        let i = 0;
        for (const result of results) {
          const { url } = await result.json();
          convertedFiles[convertVoiceIds[i]] = url;
          i += 1;
        }
        showReadyToPlayUI();

        const recentActiveFile = getFileUrlOnActiveType();
        setAudio(convertedFiles.original, ORIG_AUDIO);
        setAudio(recentActiveFile, MOD_AUDIO);
        chunks = [];
        clearFetchInterval();
      }
    }, 1000);
  }

  async function initializeUpload() {
    // has recorded
    if (mediaRecorder && recordInterval > 0) {
      stopRecord();
      const blob = new Blob(chunks, { type: "audio/wav" });
      const file = new File([blob], `recoring-for-voicemod.wav`, {
        type: "audio/wav",
      });
      const formData = new FormData();
      formData.append("audioFile", file);
      const success = await submitAudioData(formData);

      if (!success) {
        $(".upload-fail-wrapper").css({ display: "flex" });
      }

      setTimeout(() => {
        fetchAudioUrl();
      }, 1000);
    }
  }

  function voiceClick() {
    setFilesOnCorrectType();
    toggleIcon();
  }

  const buttons = ["original-btn", "voice1-btn", "voice2-btn", "voice3-btn"];

  function showVoiceItem(voiceItemClass) {
    const inactiveClasses = buttons.filter(
      (button) => button !== voiceItemClass
    );
    inactiveClasses.forEach((voiceClass) => {
      $(voiceClass).removeClass("active");
    });
    $(voiceItemClass).addClass("active");
  }

  function setVoiceItemAttr(item) {
    $(".vm-widget--btns").attr("data-voiceid", item);
  }

  $(".original-btn").on("click", function () {
    showVoiceItem(".original-btn");
    voiceClick();
    setVoiceItemAttr("original");
  });

  $(".voice1-btn").on("click", function () {
    showVoiceItem(".voice1-btn");
    voiceClick();
    setVoiceItemAttr(convertVoiceIds[0]);
  });

  $(".voice2-btn").on("click", function () {
    showVoiceItem(".voice2-btn");
    voiceClick();
    setVoiceItemAttr(convertVoiceIds[1]);
  });

  $(".voice3-btn").on("click", function () {
    showVoiceItem(".voice3-btn");
    voiceClick();
    setVoiceItemAttr(convertVoiceIds[2]);
  });

  $(".control_share--vm-widget").on("click", async function () {
    const voiceId = $(".vm-widget--btns").attr("data-voiceid") || "baby";
    const id = fetchIds[voiceId];
    const url = `${SHARE_SNIPPET_URL}?voiceId=${voiceId}&id=${id}`;
    if (navigator?.share) {
      try {
        const shareData = getShareData(url);
        if (navigator?.canShare?.(shareData)) {
          await navigator.share(shareData);
        }
      } catch (e) {
        console.log({ e });
      }
    } else {
      $(".share-link-wrapper").css({ display: "block" });
      $(".share-link").text(url);
    }
  });

  $(".share-link_btn").on("click", async function () {
    const voiceId = $(".vm-widget--btns").attr("data-voiceid") || "baby";
    const id = fetchIds[voiceId];
    const text = `${SHARE_SNIPPET_URL}?voiceId=${voiceId}&id=${id}`;
    await navigator.clipboard.writeText(text);
    $(".share-link-wrapper").css({ display: "none" });
  });
});
