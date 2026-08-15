// const API_KEY = process.env.EXPO_PUBLIC_PLANTNET_API_KEY;

// export async function identifyPlant(imageUri: string) {
//     const formData = new FormData();

//     formData.append("images", {
//         uri: imageUri,
//         name: "plant.jpg",
//         type: "image/jpeg",
//     } as any);

//     formData.append("organs", "auto");

//     const response = await fetch(
//         `https://my-api.plantnet.org/v2/identify/all?api-key=${API_KEY}`,
//         {
//             method: "POST",
//             body: formData,
//         }
//     );

//     if (!response.ok) {
//         throw new Error("PlantNet request failed");
//     }

//     return response.json();
// }


import { Platform } from "react-native";

const API_KEY = process.env.EXPO_PUBLIC_PLANTNET_API_KEY;

export async function identifyPlant(imageUri: string) {
    const formData = new FormData();

    formData.append("organs", "auto");

    if (Platform.OS === "web") {
        // Convert blob URL to Blob
        const imageResponse = await fetch(imageUri);
        const blob = await imageResponse.blob();

        formData.append("images", blob, "plant.jpg");
    } else {
        formData.append("images", {
            uri: imageUri,
            name: "plant.jpg",
            type: "image/jpeg",
        } as any);
    }

    const response = await fetch(
        `https://my-api.plantnet.org/v2/identify/all?api-key=${API_KEY}`,
        {
            method: "POST",
            body: formData,
            headers: {
                "Origin": "http://localhost:8081",
                "Referer": "http://localhost:8081/",
            }
        }
    );

    const data = await response.json();

    if (!response.ok) {
        console.error(data);
        throw new Error(data.message || "PlantNet request failed");
    }

    return data;
}


