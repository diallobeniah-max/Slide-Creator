async function createSlidesFromSetup() {
  const { slideW, slideH, slideCount, exportPrefix } = getSlideInputs();
  const docName = `${exportPrefix} Layout`;
  const totalW = Math.max(1, slideW * slideCount);

  setStatus(`Creating ${slideCount} slides at ${slideW}x${slideH} px...`, "working");

  try {
    if (slides.length > 0) {
      await closeAllSlideDocs();
      updateDeleteSlidesUI();
    }

    await core.executeAsModal(async () => {
      await action.batchPlay([{
        _obj: "make",
        _target: [{ _ref: "document" }],
        using: {
          _obj: "document",
          name: docName,
          width: { _unit: "pixelsUnit", _value: totalW },
          height: { _unit: "pixelsUnit", _value: slideH },
          resolution: { _unit: "densityUnit", _value: 72 },
          mode: { _enum: "mode", _value: "RGBColorMode" },
          fill: { _enum: "fill", _value: "white" },
        },
        _options: { dialogOptions: "dontDisplay" },
      }], {});
    }, { commandName: "Create Slides" });

    originalDocId = app.activeDocument ? app.activeDocument.id : null;
    slides = [];
    selectedSlideId = null;
    renderThumbnails();
    updateDeleteSlidesUI();
    setStatus(`Created slide layout ${totalW}x${slideH} px for ${slideCount} slides`, "success");
  } catch (e) {
    showError("Create Slides failed", e);
  }
}
