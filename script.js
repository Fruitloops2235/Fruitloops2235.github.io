
document.addEventListener('DOMContentLoaded', () => {
    const locationEl = document.getElementById('location');
    const dateEl = document.getElementById('date');
    const prayerTimesContainer = document.getElementById('prayer-times-container');
    const nextPrayerNameEl = document.getElementById('next-prayer-name');
    const nextPrayerCountdownEl = document.getElementById('next-prayer-countdown');
    const settingsModal = document.getElementById('settings-modal');
    const iqamaSettingsForm = document.getElementById('iqama-settings-form');
    const saveSettingsBtn = document.getElementById('save-settings-btn');

    const PRAYER_NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
    let prayerTimings = {};
    let iqamaSettings = {};

    // --- Core Functions ---

    function getLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;
                fetchPrayerTimes(latitude, longitude);
            }, () => {
                handleLocationError();
            });
        } else {
            handleLocationError();
        }
    }

    function handleLocationError() {
        locationEl.textContent = "Location Access Denied";
        // Fallback to a default location (e.g., London)
        fetchPrayerTimes(51.5074, -0.1278, "London, UK");
    }

    async function fetchPrayerTimes(lat, lon, locationName = null) {
        try {
            const date = new Date();
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();

            const apiResponse = await fetch(`https://api.aladhan.com/v1/calendar/${year}/${month}?latitude=${lat}&longitude=${lon}&method=2`);
            if (!apiResponse.ok) throw new Error('Network response was not ok.');
            
            const data = await apiResponse.json();
            prayerTimings = data.data[day - 1].timings;
            
            if (!locationName) {
                const cityResponse = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
                const cityData = await cityResponse.json();
                locationEl.textContent = `${cityData.city}, ${cityData.countryName}`;
            } else {
                locationEl.textContent = locationName;
            }

            dateEl.textContent = data.data[day - 1].date.readable;
            
            loadIqamaSettings();
            displayPrayerTimes();
            updateCountdown();
            setInterval(updateCountdown, 1000);

        } catch (error) {
            console.error("Error fetching prayer times:", error);
            locationEl.textContent = "Could not fetch data";
        }
    }

    function displayPrayerTimes() {
        prayerTimesContainer.innerHTML = ''; // Clear previous times
        PRAYER_NAMES.forEach(prayer => {
            const adhanTime24 = prayerTimings[prayer].split(' ')[0];
            const adhanTime12 = formatTime12(adhanTime24);
            const iqamaTime = calculateIqamaTime(adhanTime24, prayer);

            const row = document.createElement('div');
            row.classList.add('prayer-row');
            row.id = `prayer-row-${prayer.toLowerCase()}`;
            row.innerHTML = `
                <div class="prayer-info">${prayer}</div>
                <div class="prayer-times">
                    <div class="adhan-time">${adhanTime12}</div>
                    <div class="iqama-time">Iqama: ${iqamaTime}</div>
                </div>
            `;
            prayerTimesContainer.appendChild(row);
        });
    }

    function updateCountdown() {
        const now = new Date();
        let nextPrayer = null;
        let nextPrayerTime = null;

        // Create Date objects for today's prayer times
        const todayPrayerTimes = PRAYER_NAMES.map(prayer => {
            const time = prayerTimings[prayer].split(' ')[0];
            const [hours, minutes] = time.split(':');
            const prayerDate = new Date();
            prayerDate.setHours(hours, minutes, 0, 0);
            return { name: prayer, time: prayerDate };
        });

        // Find the next upcoming prayer for today
        for (const prayer of todayPrayerTimes) {
            if (prayer.time > now) {
                nextPrayer = prayer.name;
                nextPrayerTime = prayer.time;
                break;
            }
        }
        
        // If all prayers for today are done, the next prayer is Fajr tomorrow
        if (!nextPrayer) {
            const fajrTime = prayerTimings["Fajr"].split(' ')[0];
            const [hours, minutes] = fajrTime.split(':');
            nextPrayerTime = new Date();
            nextPrayerTime.setDate(nextPrayerTime.getDate() + 1); // Tomorrow
            nextPrayerTime.setHours(hours, minutes, 0, 0);
            nextPrayer = "Fajr";
        }
        
        const timeDiff = nextPrayerTime - now;
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
        
        nextPrayerNameEl.textContent = `Time until ${nextPrayer}`;
        nextPrayerCountdownEl.textContent = `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
        
        highlightCurrentPrayer(todayPrayerTimes, now);
    }
    
    function highlightCurrentPrayer(todayPrayerTimes, now){
         // Reset all rows
        document.querySelectorAll('.prayer-row').forEach(row => row.classList.remove('current'));

        let currentPrayerIndex = -1;
        for (let i = 0; i < todayPrayerTimes.length; i++) {
            if (todayPrayerTimes[i].time <= now) {
                currentPrayerIndex = i;
            } else {
                break;
            }
        }

        if (currentPrayerIndex !== -1) {
            const currentPrayerName = todayPrayerTimes[currentPrayerIndex].name;
            const currentRow = document.getElementById(`prayer-row-${currentPrayerName.toLowerCase()}`);
            if (currentRow) {
                currentRow.classList.add('current');
            }
        }
    }


    // --- Settings Modal ---
    window.toggleSettingsModal = () => {
        settingsModal.classList.toggle('hidden');
        if(!settingsModal.classList.contains('hidden')) {
            populateSettingsForm();
        }
    }
    
    function populateSettingsForm() {
        iqamaSettingsForm.innerHTML = '';
        PRAYER_NAMES.forEach(prayer => {
            const settingDiv = document.createElement('div');
            settingDiv.classList.add('iqama-setting');
            settingDiv.innerHTML = `
                <label for="iqama-${prayer}">${prayer}</label>
                <input type="number" id="iqama-${prayer}" value="${iqamaSettings[prayer] || 15}" min="0">
            `;
            iqamaSettingsForm.appendChild(settingDiv);
        });
    }

    function saveIqamaSettings() {
        PRAYER_NAMES.forEach(prayer => {
            const input = document.getElementById(`iqama-${prayer}`);
            iqamaSettings[prayer] = parseInt(input.value) || 0;
        });
        localStorage.setItem('iqamaSettings', JSON.stringify(iqamaSettings));
        toggleSettingsModal();
        displayPrayerTimes(); // Refresh display with new Iqama times
    }
    
    function loadIqamaSettings(){
        const savedSettings = localStorage.getItem('iqamaSettings');
        if(savedSettings){
            iqamaSettings = JSON.parse(savedSettings);
        } else {
            // Default settings
            iqamaSettings = { Fajr: 15, Dhuhr: 15, Asr: 15, Maghrib: 5, Isha: 10 };
        }
    }

    // --- Helper Functions ---
    function formatTime12(time24) {
        const [hours, minutes] = time24.split(':');
        const h = parseInt(hours);
        const suffix = h >= 12 ? 'PM' : 'AM';
        const h12 = ((h + 11) % 12 + 1); // Converts 24h to 12h format
        return `${h12}:${minutes} ${suffix}`;
    }

    function calculateIqamaTime(adhanTime24, prayerName) {
        const offset = iqamaSettings[prayerName] || 0;
        const [hours, minutes] = adhanTime24.split(':').map(Number);
        
        const adhanDate = new Date();
        adhanDate.setHours(hours, minutes, 0, 0);
        adhanDate.setMinutes(adhanDate.getMinutes() + offset);
        
        const iqamaHours = adhanDate.getHours();
        const iqamaMinutes = adhanDate.getMinutes();
        
        return formatTime12(`${padZero(iqamaHours)}:${padZero(iqamaMinutes)}`);
    }

    function padZero(num) {
        return num < 10 ? `0${num}` : num;
    }

    // --- Event Listeners ---
    saveSettingsBtn.addEventListener('click', saveIqamaSettings);
    
    // --- Initial Load ---
    getLocation();
});

