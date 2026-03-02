import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";

type Person = {
    id: string;
    name?: string | null;
    gender: "M" | "F";
    photoUrls?: string[];
};

const PeopleList = () => {
    const [people, setPeople] = useState<Person[]>([]);

    const fetchPeople = async () => {
        const q = query(collection(db, "people"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        setPeople(
            snapshot.docs.map((doc) => ({
                id: doc.id,
                name: doc.data().name,
                gender: doc.data().gender,
                photoUrls: doc.data().photoUrls || [],
            }))
        );
    };

    useEffect(() => {
        fetchPeople();
    }, []);

    return (
        <div className="p-4 max-w-md mx-auto space-y-4">
            <h1 className="text-2xl font-bold text-center">사람 목록</h1>

            {people.length === 0 && <p className="text-center">아직 사람이 없음</p>}

            <div className="grid grid-cols-2 gap-4">
                {people.map((p) => (
                    <Link key={p.id} to={`/person/${p.id}`}>
                        <div className="border rounded-lg p-2 flex flex-col items-center shadow hover:scale-105 transition-transform">
                            <div className="flex gap-1 flex-wrap justify-center mb-2">
                                {p.photoUrls?.length ? (
                                    p.photoUrls.map((url) => (
                                        <img
                                            src={url}
                                            alt="사진"
                                            className="w-32 h-32 object-cover rounded shadow"
                                        />
                                    ))
                                ) : (
                                    <div className="w-16 h-16 bg-gray-200 flex items-center justify-center text-xs text-gray-400 rounded">
                                        사진 없음
                                    </div>
                                )}
                            </div>
                            <p className="text-center font-medium">{p.name || "이름 없음"}</p>
                            <p className={`text-sm ${p.gender === "M" ? "text-blue-500" : "text-pink-500"}`}>
                                {p.gender === "M" ? "남" : "여"}
                            </p>
                        </div>
                    </Link>
                ))}
            </div>

            <Link
                to="/add"
                className="block mt-4 text-center text-blue-500 underline"
            >
                사람 추가 페이지로 이동
            </Link>
        </div>
    );
};

export default PeopleList;
