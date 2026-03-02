import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

type Person = {
    name?: string | null;
    gender: "M" | "F";
    photoUrls?: string[];
};

const PersonDetail = () => {
    const { id } = useParams<{ id: string }>();
    const [person, setPerson] = useState<Person | null>(null);

    useEffect(() => {
        const fetchPerson = async () => {
            if (!id) return;
            const docRef = doc(db, "people", id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) setPerson(docSnap.data() as Person);
        };
        fetchPerson();
    }, [id]);

    if (!person) return <p className="p-4 text-center">로딩 중...</p>;

    return (
        <div className="max-w-md mx-auto p-4 space-y-4">
            <Link to="/" className="text-blue-500 underline">
                목록으로 돌아가기
            </Link>
            <h1 className="text-2xl font-bold text-center">{person.name || "이름 없음"}</h1>
            <p className={`text-center ${person.gender === "M" ? "text-blue-500" : "text-pink-500"}`}>
                {person.gender === "M" ? "남" : "여"}
            </p>

            <div className="flex gap-2 flex-wrap justify-center mt-2">
                {person.photoUrls?.length ? (
                    person.photoUrls.map((url, idx) => (
                        <img
                            key={idx}
                            src={url}
                            alt="사진"
                            className="w-32 h-32 object-cover rounded shadow"
                        />
                    ))
                ) : (
                    <div className="w-32 h-32 bg-gray-200 flex items-center justify-center text-sm text-gray-400 rounded">
                        사진 없음
                    </div>
                )}
            </div>
        </div>
    );
};

export default PersonDetail;
