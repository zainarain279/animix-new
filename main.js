import { config } from "./utils/scripts.js";
import { readUsers, getRandomProxy } from "./utils/helper.js";
import log from "./utils/logger.js";
import bedduSalama from "./utils/banner.js";
import {
    fetchAllAchievements,
    fetchUserInfo,
    fetchMissionList,
    fetchPetList,
    claimMission,
    joinMission,
    getNewPet,
    fetchPetDnaList,
    indehoy,
    checkIn,
    fetchQuestList,
    joinClan,
    claimAchievement,
    fetchSeasonPass,
    claimSeasonPass,
    fetchGatchaBonus,
    claimGatchaBonus,

} from "./utils/scripts.js";

const setupGracefulShutdown = () => {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    for (const signal of signals) {
        process.on(signal, async () => {
            log.info(`Received ${signal}, starting graceful shutdown...`);
            try {
                log.logMetrics();
                log.info('Graceful shutdown completed');
                process.exit(0);
            } catch (error) {
                log.error('Error during shutdown:', error);
                process.exit(1);
            }
        });
    }
};

function getUsedPetIds(missions) {
    const usedPetIds = [];
    for (const mission of missions) {
        if (mission.pet_joined) {
            mission.pet_joined.forEach(pet => usedPetIds.push(pet.pet_id));
        }
    }
    return [...usedPetIds];
}

function getAvailablePetIds(allPetIds, usedPetIds) {
    const usedPetIdsCount = usedPetIds.reduce((acc, id) => {
        acc[id] = (acc[id] || 0) + 1;
        return acc;
    }, {});

    const availablePetIds = [];

    for (const petId of allPetIds) {
        if (usedPetIdsCount[petId] > 0) {
            usedPetIdsCount[petId]--;
        } else {
            availablePetIds.push(petId);
        }
    }

    return availablePetIds;
}

function checkFirstMatchingMission(missions, availablePetIds, usedPetIds, petIdsByStarAndClass) {
    for (let i = missions.length - 1; i >= 0; i--) {
        const mission = missions[i];
        if (mission.pet_joined) {
            continue;
        }
        const getPetIdsByClassAndMinStar = (classType, minStar) => {
            return Object.entries(petIdsByStarAndClass)
                .filter(([star]) => parseInt(star, 10) >= minStar)
                .flatMap(([_, classMap]) => classMap[classType] || []);
        };

        const petIds = { pet_1_id: null, pet_2_id: null, pet_3_id: null };
        const assignedPetIds = new Set();

        const assignPet = (petClass, petStar, petKey) => {
            const petMatches = getPetIdsByClassAndMinStar(petClass, petStar);
            const availablePet = petMatches.find(pet => availablePetIds.includes(pet) && !assignedPetIds.has(pet));

            if (availablePet) {
                petIds[petKey] = availablePet;
                usedPetIds.push(availablePet);
                assignedPetIds.add(availablePet);
            }
        };

        assignPet(mission.pet_1_class, mission.pet_1_star, "pet_1_id");
        assignPet(mission.pet_2_class, mission.pet_2_star, "pet_2_id");
        assignPet(mission.pet_3_class, mission.pet_3_star, "pet_3_id");

        if (petIds.pet_1_id && petIds.pet_2_id && petIds.pet_3_id) {
            const matchingMission = { mission_id: mission.mission_id, ...petIds };
            return matchingMission;
        }
    }

    return null;
}

const getPower = async (headers, proxy) => {
    const userInfo = (await fetchUserInfo(headers, proxy))?.result;
    const name = userInfo?.telegram_username || "Unknown";
    const token = userInfo?.token || 0;
    const power = userInfo?.god_power || 0;
    log.debug(`Users:`, JSON.stringify({ name, token, power }));

    return power;
}
const mergePetIds = async (headers, proxy) => {
    const petIds = await fetchPetDnaList(headers, proxy);
    if (!petIds.allPetIds || petIds.allPetIds.length < 1) {
        return;
    };
    log.info("Number Available Female Pet:", petIds?.momPetIds?.length || 0);
    log.info("Number Available Male Pet:", petIds?.dadPetIds?.length || 0);

    if (petIds.momPetIds.length < 1) {
        log.warn("you don't have any female pets to indehoy 😢💔");
        return;
    }

    const moms = [...petIds.momPetIds];
    const dads = [...petIds.dadPetIds];

    while (moms.length > 0) {
        const momIndex = Math.floor(Math.random() * moms.length);
        const dadIndex = Math.floor(Math.random() * dads.length);

        const mom = moms[momIndex];
        const dad = dads[dadIndex];

        if (mom !== undefined && dad !== undefined) {
            log.info(`Indehoy pets ${mom} and ${dad}💕`);
            await indehoy(headers, proxy, mom, dad);
            log.metrics.petsMerged++;

            moms.splice(momIndex, 1);
            dads.splice(dadIndex, 1);
            await delay(1);
        } else if (moms.length > 1 && momIndex + 1 < moms.length && dads.length > 0) {
            const nextMom = moms[momIndex + 1];
            const nextDad = dads[0];

            if (mom !== nextMom) {
                log.info(`Indehoy pets ${mom} and ${nextDad}💕`);
                await indehoy(headers, proxy, mom, nextDad);
                log.metrics.petsMerged++;

                moms.splice(momIndex, 1);
                moms.splice(momIndex, 1);
                dads.splice(0, 1);
                await delay(1);
            }
        } else {
            log.warn("you don't have any couple to indehoy 😢💔.");
            break;
        }
    }
};

const doMissions = async (headers, proxy) => {
    const petData = await fetchPetList(headers, proxy);
    const { petIdsByStarAndClass, allPetIds } = petData;
    const missionLists = await fetchMissionList(headers, proxy);
    const usedPetIds = getUsedPetIds(missionLists);
    const availablePetIds = getAvailablePetIds(allPetIds, usedPetIds);
    log.info("Number Available Pets:", availablePetIds.length);

    const firstMatchingMission = checkFirstMatchingMission(missionLists, availablePetIds, usedPetIds, petIdsByStarAndClass);
    if (firstMatchingMission) {
        log.info("Entering mission with available pets:", JSON.stringify(firstMatchingMission));
        await joinMission(headers, proxy, firstMatchingMission);
        log.metrics.missionsClaimed++;
        await doMissions(headers, proxy);
    } else {
        log.warn("Cannot Join another missions with current available pets.");
    }
}

const doDailyQuests = async (headers, proxy, dailyQuests) => {
    for (const quest of dailyQuests) {
        log.info("Doing daily quest:", quest);
        await checkIn(headers, proxy, quest);
    }
}
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms * 1000));

const getSeasonPass = async (headers, proxy) => {
    const seasonPasss = await fetchSeasonPass(headers, proxy);

    if (seasonPasss) {
        for (const seasonPass of seasonPasss) {
            const { season_id: seasonPassId = 0, current_step: currentStep = 0, title = "Unknown", free_rewards: freePassRewards = [] } = seasonPass;

            log.info(`Checking Season Pass ID: ${seasonPassId}, Current Step: ${currentStep}, Description: ${title}`);

            for (const reward of freePassRewards) {
                const { step, is_claimed: isClaimed, amount, name } = reward;

                if (step > currentStep || isClaimed) {
                    continue;
                }

                log.info(`Claiming Reward for Season Pass ID: ${seasonPassId}, Step: ${step}, Reward: ${amount} ${name}`);
                await claimSeasonPass(headers, proxy, seasonPassId, 'free', step);
            }
        }
    } else {
        log.warn("Season pass not found.");
    }
}

const checkUserReward = async (headers, proxy) => {
    log.info("Checking for available Quests...");
    try {
        const questIds = await fetchQuestList(headers, proxy);
        if (questIds.length > 1) {
            log.info("Found Quest IDs:", questIds);
            await joinClan(headers, proxy);
            await doDailyQuests(headers, proxy, questIds);
            await delay(2);
        } else {
            log.warn("No quests to do.");
        }
        log.info("Checking for completed achievements...");
        await delay(1);
        const achievements = await fetchAllAchievements(headers, proxy);
        if (achievements.length > 0) {
            log.info("Found Completed achievements:", achievements.length);
            await delay(1);
            for (const achievement of achievements) {
                log.info("Claiming achievement ID:", achievement);
                await claimAchievement(headers, proxy, achievement);
                await delay(1);
            }
        } else {
            log.warn("No completed achievements found.");
        }
        log.info("Checking for available season pass...");
        await getSeasonPass(headers, proxy);
        await delay(1);
    } catch (error) {
        log.error("Error checking user rewards:", error);
    }
};

async function startMission() {
    const users = readUsers("users.txt");

    let userCount = 1;
    for (const user of users) {
        const proxy = getRandomProxy();
        console.log(`\n`)
        log.info(` === Running for user #${userCount} Using Proxy : ${proxy} ===`);
        const headers = {
            "Content-Type": "application/json",
            "tg-init-data": user,
        };

        log.info("Fetching Gatcha Bonus...");
        const gatchaBonus = await fetchGatchaBonus(headers, proxy);
        const { current_step, is_claimed_god_power, is_claimed_dna, step_bonus_god_power, step_bonus_dna } = gatchaBonus;
        if (current_step >= step_bonus_god_power && !is_claimed_god_power) {
            log.info("Claiming God Power Bonus...");
            await claimGatchaBonus(headers, proxy, 1);
        } else if (current_step >= step_bonus_dna && !is_claimed_dna) {
            log.info("Claiming DNA Bonus...");
            await claimGatchaBonus(headers, proxy, 2);
        } else {
            log.warn("No bonus from gatcha to claim.");
        };

        let power = await getPower(headers, proxy);
        while (power >= 1) {
            log.info("Power is enough to gatcha new pet. lets go!");
            power = await getNewPet(headers, proxy);
            await delay(1);
        };

        log.info("Fetching pet mom and dad can indehoy!❤️");
        await mergePetIds(headers, proxy);
        await delay(1);
        try {
            const missionLists = await fetchMissionList(headers, proxy);

            log.info("Checking for completed missions...");
            await delay(1);
            const missionIds = missionLists.filter(mission => mission.can_completed).map(mission => mission.mission_id);
            if (missionIds.length > 0) {
                for (const missionId of missionIds) {
                    log.info("Claiming mission with ID:", missionId);
                    await claimMission(headers, proxy, missionId);
                    await delay(1);
                }
            } else {
                log.warn("No completed missions found.");
            };
            log.info("Checking for available missions to enter...");
            await doMissions(headers, proxy)
            await delay(1);
            await checkUserReward(headers, proxy);
        } catch (error) {
            log.error("Error fetching Missions data:", error);
        }
        userCount++;
    }
}

async function main() {
    setupGracefulShutdown();
    log.debug(bedduSalama);
    
    while (true) {
        try {
            await startMission();
            log.logMetrics();
        } catch (error) {
            log.error('Critical error in main loop:', error.message || error);
            log.metrics.requestsFailed++;
        }
        
        log.warn(`Waiting for ${config.WAIT_INTERVAL / 60} minutes before continuing...`);
        await delay(config.WAIT_INTERVAL);
    }
}

main();
