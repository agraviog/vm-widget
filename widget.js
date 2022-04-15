var Webflow = Webflow || [];
Webflow.push(function () {
  const lottie = Webflow.require("lottie").lottie;
  const REQUEST_KEY = "voicemod_mic_request";
  const animations = lottie.getRegisteredAnimations();
  const API_URL = "https://api.voicemod.net/v2/cloud";
  const X_KEY = "DGx0ojrgI6lpD7M6kqecr4jkh5in4q8c";
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
  let wavesurfer;
  const convertedFiles = {
    baby: "",
    "magic-chords": "",
    cave: "",
    "radio-demon": "",
    "man-to-woman": "",
    deep: "",
    original: "",
  };

  const fetchIds = {
    baby: "",
    "magic-chords": "",
    cave: "",
    "radio-demon": "",
    "man-to-woman": "",
    deep: "",
    original: "",
  };

  const convertVoiceIds = [
    "baby",
    "magic-chords",
    "cave",
    "radio-demon",
    "man-to-woman",
    "deep",
  ];

  function getFileUrlOnActiveType() {
    const voiceId =
      $(".audio-snippet_btn__wrapper").attr("data-voiceid") || "baby";
    if (!!convertedFiles.original) {
      return convertedFiles[voiceId];
    }
    return null;
  }

  function toggleIcon() {
    state = "ready_to_play";
    $(".pause_icon").removeClass("played");
    $(".play_icon").addClass("paused");
  }

  function resetPlay() {
    const transformedEl = document.getElementById(MOD_AUDIO);
    const originalEl = document.getElementById(ORIG_AUDIO);
    if (transformedEl || originalEl) {
      transformedEl.currentTime = 0;
      transformedEl.pause();
      originalEl.pause();
      originalEl.currentTime = 0;
      if (wavesurfer) {
        wavesurfer.stop();
      }
    }
  }

  function setFilesOnCorrectType() {
    setTimeout(() => {
      const voiceId =
        $(".audio-snippet_btn__wrapper").attr("data-voiceid") || "baby";
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

  $("#checkbox-2").on("click", function () {
    if (!$(".voicemod_checkbox").hasClass("control_disable")) {
      $(".toggle-text").toggleClass("toggle-off");
      $(".toggle-text-off").toggleClass("toggle-off");
      isTransformed = !isTransformed;
      if (!isTransformed) {
        disableButtons(false);
      } else {
        showReadyToPlayUI();
      }
      toggleIcon();
      resetPlay();
    }
  });

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

  function closeModal() {
    [
      // to keep
      ".upload-fail-wrapper",
      ".mic-detection-wrapper",
      ".convert-failed-wrapper",
    ].forEach((modal) => {
      $(modal).css({ display: "none" });
    });
  }

  $(".record_new_audio_button").on("click", () => {
    closeModal();
    startRecordProcess();
  });

  $(".play-voicemod").on("click", closeModal);

  $(".modal_close").on("click", closeModal);

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

  $(`.control_play`).on("click", function () {
    const transformedAudioElement = document.getElementById(MOD_AUDIO);
    const originalAudioElement = document.getElementById(ORIG_AUDIO);

    if (
      transformedAudioElement &&
      originalAudioElement &&
      !$(".control_play").hasClass("control_disable")
    ) {
      state = state === "playing" ? "paused" : "playing";
      if (state === "playing") {
        handlePlay(originalAudioElement, transformedAudioElement);
        if (wavesurfer) {
          wavesurfer.play();
        }
      } else {
        transformedAudioElement.pause();
        originalAudioElement.pause();
        if (wavesurfer) {
          wavesurfer.pause();
        }
      }

      $(".pause_icon").toggleClass("played");
      $(".play_icon").toggleClass("paused");
    }
  });

  function showLoadingUI() {
    state = "loading";
    $(".record_icon").addClass("stop_record");
    $(".loading_record").addClass("stop_record");
    $(".converting_state").addClass("stop_record");
    $(".record_icon").removeClass("start_record");
    $(".countdown_record").removeClass("start_record");
  }

  function showReadyToPlayUI() {
    state = "ready_to_play";
    $(".record_icon").removeClass("stop_record");
    $(".loading_record").removeClass("stop_record");
    $(".converting_state").removeClass("stop_record");

    $(".control_share").removeClass("control_disable");
    $(".control_play").removeClass("control_disable");
    $(".toggle-text").removeClass("control_disable");
    $(".checkbox").removeClass("control_disable");
    $(".audio-snippet_btn").removeClass("control_disable");
    $("#checkbox-2").removeAttr("disabled");
  }

  function destroyWavesurfer() {
    if (wavesurfer) {
      wavesurfer.destroy();
    }
    wavesurfer = null;
  }

  function disableButtons(disablePlay = true, disableWavesurfer) {
    $(".record_icon").removeClass("start_record");
    $(".control_share").addClass("control_disable");
    $(".audio-snippet_btn").addClass("control_disable");
    if (disableWavesurfer) {
      destroyWavesurfer();
    }
    if (disablePlay) {
      $(".toggle-text").addClass("control_disable");
      $(".control_play").addClass("control_disable");
    }
    if (state === "playing") {
      toggleIcon();
    }
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
          $(".mic-detection-wrapper").css({ display: "none" });
          if (mediaRecorder) {
            mediaRecorder.onstart = function () {
              disableButtons(true, true);
              state = "recording";
              $("#checkbox-2").attr("disabled", "true");
              $(".record_icon").addClass("start_record");
              $(".countdown_record").addClass("start_record");
              animations[0].play();
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
        $(".mic-detection-wrapper").css({ display: "flex" });
        localStorage.removeItem(REQUEST_KEY);
      }
    }
  }

  $(".control_record").on("click", startRecordProcess);

  function clearFetchInterval() {
    clearInterval(fetchInterval);
    fetchInterval = null;
    retryCount = 0;
  }

  async function fetchAudioUrl() {
    fetchInterval = setInterval(async () => {
      if (retryCount > MAX_GET_RETRIES) {
        clearFetchInterval();
        $(".convert-failed-wrapper").css({ display: "flex" });
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

      if (results.some((res) => [400, 500].includes(res.status))) {
        clearFetchInterval();
        $(".convert-failed-wrapper").css({ display: "flex" });
        throw new Error("Fetch was not successful!");
      }
      retryCount += 1;
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
        destroyWavesurfer();
        wavesurfer = WaveSurfer.create({
          container: ".wf_wrap",
          barWidth: 2.5,
          barHeight: 1.5,
          barMinHeight: 4,
          barGap: 3,
          responsive: true,
          interact: false,
          progressColor: "#00fff6",
          cursorColor: "transparent",
          height: 28,
          barRadius: 2,
        });
        wavesurfer.load(convertedFiles.original);
        wavesurfer.setVolume(0);
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

  function showVoiceItem(voiceItem) {
    $(".audio-snippet_icons").removeClass("description--current");
    $(`.${voiceItem}--icon`).addClass("description--current");
    convertVoiceIds.forEach((voiceId) =>
      $(`#${voiceId}-btn`).removeClass("overlay-btn--current")
    );
    $(`#${voiceItem}-btn`).addClass("overlay-btn--current");
    $(".audio-snippet_btn__wrapper").attr("data-voiceid", voiceItem);
    $(".audio-snippet_description").removeClass("description--current");
    $(`.${voiceItem}--description`).addClass("description--current");
  }

  $(".overlay--baby").on("click", function () {
    if (!$(".audio-snippet_btn").hasClass("control_disable")) {
      showVoiceItem("baby");
      voiceClick();
    }
  });

  $(".overlay--magic-chords").on("click", function () {
    if (!$(".audio-snippet_btn").hasClass("control_disable")) {
      showVoiceItem("magic-chords");
      voiceClick();
    }
  });

  $(".overlay--cave").on("click", function () {
    if (!$(".audio-snippet_btn").hasClass("control_disable")) {
      showVoiceItem("cave");
      voiceClick();
    }
  });

  $(".overlay--radio-demon").on("click", function () {
    if (!$(".audio-snippet_btn").hasClass("control_disable")) {
      showVoiceItem("radio-demon");
      voiceClick();
    }
  });

  $(".overlay--man-to-woman").on("click", function () {
    if (!$(".audio-snippet_btn").hasClass("control_disable")) {
      showVoiceItem("man-to-woman");
      voiceClick();
    }
  });

  $(".overlay--deep").on("click", function () {
    if (!$(".audio-snippet_btn").hasClass("control_disable")) {
      showVoiceItem("deep");
      voiceClick();
    }
  });

  $(".control_share").on("click", async function () {
    if (!$(".control_share").hasClass("control_disable")) {
      const voiceId =
        $(".audio-snippet_btn__wrapper").attr("data-voiceid") || "baby";
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
    }
  });

  $(".share-link_btn").on("click", async function () {
    const voiceId =
      $(".audio-snippet_btn__wrapper").attr("data-voiceid") || "baby";
    const id = fetchIds[voiceId];
    const text = `${SHARE_SNIPPET_URL}?voiceId=${voiceId}&id=${id}`;
    await navigator.clipboard.writeText(text);
    $(".share-link-wrapper").css({ display: "none" });
  });

  $("#checkbox-2").attr("disabled", "true");
});
