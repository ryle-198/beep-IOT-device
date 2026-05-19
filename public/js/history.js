const SERVER =
  "https://beep-iot-device-production.up.railway.app";

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const tableBody =
      document.getElementById(
        "history-body"
      );

    const eventCount =
      document.getElementById(
        "event-count"
      );

    // =======================================

    async function loadHistory() {

      try {

        const res =
          await fetch(
            `${SERVER}/api/history`
          );

        const data =
          await res.json();

        tableBody.innerHTML = "";

        // newest first

        const sortedData =
          [...data].reverse();

        // live count

        eventCount.textContent =
          sortedData.length;

        // empty state

        if (sortedData.length === 0) {

          tableBody.innerHTML = `
            <tr>
              <td
                colspan="5"
                class="text-center py-10 text-gray-500"
              >
                No history events recorded
              </td>
            </tr>
          `;

          return;
        }

        // render rows

        sortedData.forEach(event => {

          const row =
            document.createElement("tr");

          row.className =
            "hover:bg-white/5 transition-colors";

          // status styling

          let statusClass =
            "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";

          if (
            event.status &&
            (
              event.status.toLowerCase().includes("trigger") ||
              event.status.toLowerCase().includes("denied") ||
              event.status.toLowerCase().includes("intrusion")
            )
          ) {

            statusClass =
              "bg-red-500/10 text-red-400 border border-red-500/30";
          }

          // fallback values

          const description =
            event.description || "Unknown Event";

          const source =
            event.source || "System";

          const status =
            event.status || "Recorded";

          const datetime =
            event.datetime || "--";

          row.innerHTML = `

            <td class="px-8 py-5 text-sm text-gray-200">
              ${description}
            </td>

            <td class="px-6 py-5 text-sm text-gray-400">
              ${source}
            </td>

            <td class="px-6 py-5">

              <span
                class="px-3 py-1 rounded-full text-[10px] font-bold uppercase ${statusClass}"
              >
                ${status}
              </span>

            </td>

            <td class="px-6 py-5 text-sm text-gray-400">
              ${datetime}
            </td>

            <td class="px-6 py-5 text-center text-gray-500">
              •••
            </td>
          `;

          tableBody.appendChild(row);
        });

      } catch (err) {

        console.error(
          "Failed to load history:",
          err
        );

        tableBody.innerHTML = `
          <tr>
            <td
              colspan="5"
              class="text-center py-10 text-red-400"
            >
              Failed to load history
            </td>
          </tr>
        `;
      }
    }

    // =======================================

    loadHistory();

    setInterval(loadHistory, 4000);
  }
);
