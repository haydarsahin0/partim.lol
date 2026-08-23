import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { ProvinceDetailView } from "@/components/ProvinceDetailView";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ProvincePage() {
  const { provinceId = "" } = useParams();
  const province = PROVINCE_BY_ID[provinceId];

  if (!province) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <Card className="p-8 text-center">
          <h1 className="font-display text-xl font-bold">Böyle bir il yok</h1>
          <Button asChild className="mt-4">
            <Link to="/">Haritaya dön</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 p-3 sm:p-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/?il=${province.id}`}>
          <ArrowLeft />
          Haritaya dön
        </Link>
      </Button>
      <Card className="overflow-hidden p-0">
        <ProvinceDetailView provinceId={province.id} />
      </Card>
    </div>
  );
}
