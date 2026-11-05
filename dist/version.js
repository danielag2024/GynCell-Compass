const compassVersions = window.COMPASS_RELEASES;
const versionPicker = document.querySelector("#version");
const escapeVersion = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
versionPicker.innerHTML = compassVersions
  .map(
    (release) =>
      `<option value="${escapeVersion(release.id)}">${escapeVersion(release.label)}</option>`,
  )
  .join("");
versionPicker.value = window.COMPASS_DATA.version;
versionPicker.addEventListener("change", (event) => {
  const release = compassVersions.find(
    (item) => item.id === event.target.value,
  );
  if (release && release.id !== window.COMPASS_DATA.version) {
    location.href = new URL(release.url, window.COMPASS_RELEASE_BASE).href;
  }
});
